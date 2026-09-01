import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const userRole = pgEnum('user_role', ['admin', 'member']);
export const libraryKind = pgEnum('library_kind', ['movies', 'shows']);
export const mediaKind = pgEnum('media_kind', ['movie', 'series', 'season', 'episode']);
export const scanStatus = pgEnum('scan_status', ['queued', 'running', 'completed', 'failed']);
export const pluginRunStatus = pgEnum('plugin_run_status', ['running', 'succeeded', 'failed']);
export const deviceAuthStatus = pgEnum('device_auth_status', ['pending', 'approved', 'denied']);
export const downloadStatus = pgEnum('download_status', ['preparing', 'ready', 'claimed', 'failed']);

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: text('username').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: userRole('role').notNull().default('member'),
  disabled: boolean('disabled').notNull().default(false),
  /** Highest maturity level this account may watch; null means no limit. */
  maxMaturityLevel: integer('max_maturity_level'),
  ...timestamps,
}, (table) => [uniqueIndex('users_username_unique').on(table.username)]);

export const userSettings = pgTable('user_settings', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  showCollectionGaps: boolean('show_collection_gaps').notNull().default(false),
  /** Remembered playback rate, as a percentage of normal speed. */
  playbackSpeedPercent: integer('playback_speed_percent').notNull().default(100),
  /** Caption size, as a percentage of the player's default. */
  subtitleSizePercent: integer('subtitle_size_percent').notNull().default(100),
  /** Backdrop behind captions: none, a soft shadow, or a solid box. */
  subtitleBackground: text('subtitle_background').notNull().default('shadow'),
  ...timestamps,
});

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  /** Operator-facing label for the signed-in device, shown in device management. */
  deviceName: text('device_name'),
  /** How the session was created: 'password' or 'device' (QR pairing). */
  createdVia: text('created_via').notNull().default('password'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('sessions_token_hash_unique').on(table.tokenHash),
  index('sessions_user_id_index').on(table.userId),
]);

/**
 * Pairing requests for the QR device flow. A device polls with its secret
 * device code while the user approves the short user code on a signed-in phone.
 */
/**
 * One row per active playback. The player starts a session, heartbeats while it
 * plays, and ends it on exit; administrators watch these to see what the server
 * is serving right now.
 */
/**
 * One requested offline download. The server keeps the encoded file only while
 * the device is fetching it; the row outlives the file so an interrupted
 * transfer can resume and so expiry is server truth rather than a device claim.
 */
export const downloadGrants = pgTable('download_grants', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  mediaItemId: uuid('media_item_id').notNull().references(() => mediaItems.id, { onDelete: 'cascade' }),
  profile: text('profile').notNull(),
  status: downloadStatus('status').notNull().default('preparing'),
  /** Absolute path of the encoded file while it exists. */
  filePath: text('file_path'),
  /** Size once encoded; null while preparing. */
  sizeBytes: bigint('size_bytes', { mode: 'number' }),
  estimatedBytes: bigint('estimated_bytes', { mode: 'number' }).notNull().default(0),
  error: text('error'),
  /** When the device copy stops being playable. */
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  claimedAt: timestamp('claimed_at', { withTimezone: true }),
  ...timestamps,
}, (table) => [
  index('download_grants_user_index').on(table.userId),
  index('download_grants_status_index').on(table.status),
]);

export const playbackSessions = pgTable('playback_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  mediaItemId: uuid('media_item_id').notNull().references(() => mediaItems.id, { onDelete: 'cascade' }),
  deviceName: text('device_name'),
  /** How the file reaches the client: direct play, remux, or a full transcode. */
  playMethod: text('play_method').notNull().default('direct'),
  positionSeconds: integer('position_seconds').notNull().default(0),
  durationSeconds: integer('duration_seconds'),
  paused: boolean('paused').notNull().default(false),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  lastReportedAt: timestamp('last_reported_at', { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
}, (table) => [
  index('playback_sessions_active_index').on(table.endedAt, table.lastReportedAt),
  index('playback_sessions_user_index').on(table.userId),
]);

export const deviceAuthRequests = pgTable('device_auth_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Short, human-readable code shown on the device (e.g. `K7QP-2M4X`). */
  userCode: text('user_code').notNull(),
  /** Hash of the device's long-lived secret; the plaintext never leaves the device. */
  deviceCodeHash: text('device_code_hash').notNull(),
  deviceName: text('device_name').notNull(),
  status: deviceAuthStatus('status').notNull().default('pending'),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  /** Set once the device exchanges an approved request for a session. */
  claimedAt: timestamp('claimed_at', { withTimezone: true }),
  /** Enforces the polling interval without a separate rate limiter. */
  lastPolledAt: timestamp('last_polled_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('device_auth_requests_user_code_unique').on(table.userCode),
  uniqueIndex('device_auth_requests_device_code_hash_unique').on(table.deviceCodeHash),
]);

export const libraries = pgTable('libraries', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  kind: libraryKind('kind').notNull(),
  rootPath: text('root_path').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  lastScannedAt: timestamp('last_scanned_at', { withTimezone: true }),
  ...timestamps,
}, (table) => [
  uniqueIndex('libraries_name_unique').on(table.name),
  uniqueIndex('libraries_root_path_unique').on(table.rootPath),
]);

export const mediaItems = pgTable('media_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  libraryId: uuid('library_id').notNull().references(() => libraries.id, { onDelete: 'cascade' }),
  parentId: uuid('parent_id').references((): AnyPgColumn => mediaItems.id, { onDelete: 'cascade' }),
  kind: mediaKind('kind').notNull(),
  naturalKey: text('natural_key').notNull(),
  title: text('title').notNull(),
  sortTitle: text('sort_title').notNull(),
  originalTitle: text('original_title'),
  year: integer('year'),
  releaseDate: date('release_date'),
  seasonNumber: integer('season_number'),
  episodeNumber: integer('episode_number'),
  overview: text('overview'),
  tagline: text('tagline'),
  providerRating: real('provider_rating'),
  contentRating: text('content_rating'),
  /** contentRating normalized to a comparable level; set during enrichment. */
  maturityLevel: integer('maturity_level'),
  userTitle: text('user_title'),
  userYear: integer('user_year'),
  userOverview: text('user_overview'),
  posterPath: text('poster_path'),
  backdropPath: text('backdrop_path'),
  logoPath: text('logo_path'),
  metadataSource: text('metadata_source'),
  providerIds: jsonb('provider_ids').$type<Record<string, string>>().notNull().default({}),
  enrichmentVersion: integer('enrichment_version').notNull().default(0),
  enrichmentLastAttemptAt: timestamp('enrichment_last_attempt_at', { withTimezone: true }),
  enrichmentLastSuccessAt: timestamp('enrichment_last_success_at', { withTimezone: true }),
  available: boolean('available').notNull().default(true),
  /** Set when an item has no available files (its media was deleted): hidden from
   * members, retained and editable by admins. Cleared when a file reappears. */
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  ...timestamps,
}, (table) => [
  index('media_items_library_id_index').on(table.libraryId),
  index('media_items_parent_id_index').on(table.parentId),
  index('media_items_archived_at_index').on(table.archivedAt),
  uniqueIndex('media_items_library_natural_key_unique').on(table.libraryId, table.naturalKey),
]);

export const mediaFiles = pgTable('media_files', {
  id: uuid('id').primaryKey().defaultRandom(),
  mediaItemId: uuid('media_item_id').notNull().references(() => mediaItems.id, { onDelete: 'cascade' }),
  libraryId: uuid('library_id').notNull().references(() => libraries.id, { onDelete: 'cascade' }),
  relativePath: text('relative_path').notNull(),
  sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
  modifiedAt: timestamp('modified_at', { withTimezone: true }).notNull(),
  durationSeconds: integer('duration_seconds'),
  probe: jsonb('probe').$type<Record<string, unknown>>().notNull().default({}),
  available: boolean('available').notNull().default(true),
  lastSeenScanId: uuid('last_seen_scan_id').references((): AnyPgColumn => scanRuns.id, { onDelete: 'set null' }),
  ...timestamps,
}, (table) => [
  uniqueIndex('media_files_library_path_unique').on(table.libraryId, table.relativePath),
  index('media_files_media_item_id_index').on(table.mediaItemId),
]);

export const mediaTechnicalProfiles = pgTable('media_technical_profiles', {
  mediaFileId: uuid('media_file_id').primaryKey().references(() => mediaFiles.id, { onDelete: 'cascade' }),
  resolutionLabel: text('resolution_label'),
  width: integer('width'),
  height: integer('height'),
  videoCodec: text('video_codec'),
  audioCodec: text('audio_codec'),
  audioChannels: text('audio_channels'),
  dynamicRange: text('dynamic_range'),
  bitrate: bigint('bitrate', { mode: 'number' }),
  details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
  ...timestamps,
}, (table) => [
  index('media_technical_profiles_resolution_index').on(table.resolutionLabel),
]);

export const mediaPreviewSprites = pgTable('media_preview_sprites', {
  mediaFileId: uuid('media_file_id').primaryKey().references(() => mediaFiles.id, { onDelete: 'cascade' }),
  storageKey: text('storage_key').notNull(),
  columns: integer('columns').notNull(),
  rows: integer('rows').notNull(),
  /** Seconds of video represented by each tile. */
  interval: integer('interval').notNull(),
  tileWidth: integer('tile_width').notNull(),
  tileHeight: integer('tile_height').notNull(),
  /** Fingerprint of the source file + settings so unchanged sprites are skipped. */
  signature: text('signature').notNull(),
  ...timestamps,
});

export const mediaIntroMarkers = pgTable('media_intro_markers', {
  mediaFileId: uuid('media_file_id').primaryKey().references(() => mediaFiles.id, { onDelete: 'cascade' }),
  startSeconds: real('start_seconds').notNull(),
  endSeconds: real('end_seconds').notNull(),
  /** How the marker was produced; manual edits can override detection later. */
  source: text('source').notNull().default('audio-correlation'),
  /** Fingerprint of the source file + settings so unchanged files are skipped. */
  signature: text('signature').notNull(),
  ...timestamps,
});

export const genres = pgTable('genres', {
  id: uuid('id').primaryKey().defaultRandom(),
  libraryId: uuid('library_id').notNull().references(() => libraries.id, { onDelete: 'cascade' }),
  providerSource: text('provider_source').notNull().default('tmdb'),
  providerId: text('provider_id'),
  name: text('name').notNull(),
  normalizedName: text('normalized_name').notNull(),
  ...timestamps,
}, (table) => [
  uniqueIndex('genres_library_normalized_name_unique').on(table.libraryId, table.normalizedName),
  uniqueIndex('genres_library_provider_unique').on(table.libraryId, table.providerSource, table.providerId),
  index('genres_library_id_index').on(table.libraryId),
]);

export const mediaItemGenres = pgTable('media_item_genres', {
  mediaItemId: uuid('media_item_id').notNull().references(() => mediaItems.id, { onDelete: 'cascade' }),
  genreId: uuid('genre_id').notNull().references(() => genres.id, { onDelete: 'cascade' }),
  position: integer('position').notNull().default(0),
}, (table) => [
  uniqueIndex('media_item_genres_item_genre_unique').on(table.mediaItemId, table.genreId),
  index('media_item_genres_genre_id_index').on(table.genreId),
  index('media_item_genres_item_position_index').on(table.mediaItemId, table.position),
]);

export const people = pgTable('people', {
  id: uuid('id').primaryKey().defaultRandom(),
  libraryId: uuid('library_id').notNull().references(() => libraries.id, { onDelete: 'cascade' }),
  providerSource: text('provider_source').notNull().default('tmdb'),
  providerId: text('provider_id').notNull(),
  name: text('name').notNull(),
  profilePath: text('profile_path'),
  ...timestamps,
}, (table) => [
  uniqueIndex('people_library_provider_unique').on(table.libraryId, table.providerSource, table.providerId),
  index('people_library_name_index').on(table.libraryId, table.name),
]);

export const castCredits = pgTable('cast_credits', {
  id: uuid('id').primaryKey().defaultRandom(),
  mediaItemId: uuid('media_item_id').notNull().references(() => mediaItems.id, { onDelete: 'cascade' }),
  personId: uuid('person_id').notNull().references(() => people.id, { onDelete: 'cascade' }),
  character: text('character'),
  billingOrder: integer('billing_order').notNull().default(0),
  ...timestamps,
}, (table) => [
  uniqueIndex('cast_credits_item_person_unique').on(table.mediaItemId, table.personId),
  index('cast_credits_item_order_index').on(table.mediaItemId, table.billingOrder),
  index('cast_credits_person_id_index').on(table.personId),
]);

export const collections = pgTable('collections', {
  id: uuid('id').primaryKey().defaultRandom(),
  libraryId: uuid('library_id').notNull().references(() => libraries.id, { onDelete: 'cascade' }),
  providerSource: text('provider_source').notNull().default('tmdb'),
  providerId: text('provider_id').notNull(),
  name: text('name').notNull(),
  overview: text('overview'),
  posterPath: text('poster_path'),
  backdropPath: text('backdrop_path'),
  ...timestamps,
}, (table) => [
  uniqueIndex('collections_library_provider_unique').on(table.libraryId, table.providerSource, table.providerId),
  index('collections_library_name_index').on(table.libraryId, table.name),
]);

export const collectionMembers = pgTable('collection_members', {
  collectionId: uuid('collection_id').notNull().references(() => collections.id, { onDelete: 'cascade' }),
  mediaItemId: uuid('media_item_id').notNull().references(() => mediaItems.id, { onDelete: 'cascade' }),
  position: integer('position').notNull().default(0),
  ...timestamps,
}, (table) => [
  uniqueIndex('collection_members_collection_item_unique').on(table.collectionId, table.mediaItemId),
  uniqueIndex('collection_members_media_item_unique').on(table.mediaItemId),
  index('collection_members_collection_position_index').on(table.collectionId, table.position),
]);

export const collectionExpectedMembers = pgTable('collection_expected_members', {
  collectionId: uuid('collection_id').notNull().references(() => collections.id, { onDelete: 'cascade' }),
  tmdbId: text('tmdb_id').notNull(),
  title: text('title').notNull(),
  year: integer('year'),
  releaseDate: date('release_date'),
  posterPath: text('poster_path'),
  ...timestamps,
}, (table) => [
  uniqueIndex('collection_expected_members_collection_tmdb_unique').on(table.collectionId, table.tmdbId),
  index('collection_expected_members_collection_release_index').on(table.collectionId, table.releaseDate),
]);

export const userCollections = pgTable('user_collections', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  overview: text('overview'),
  ...timestamps,
}, (table) => [index('user_collections_user_name_index').on(table.userId, table.name)]);

export const userCollectionItems = pgTable('user_collection_items', {
  userCollectionId: uuid('user_collection_id').notNull().references(() => userCollections.id, { onDelete: 'cascade' }),
  mediaItemId: uuid('media_item_id').notNull().references(() => mediaItems.id, { onDelete: 'cascade' }),
  position: integer('position').notNull().default(0),
  addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('user_collection_items_collection_item_unique').on(table.userCollectionId, table.mediaItemId),
  index('user_collection_items_collection_position_index').on(table.userCollectionId, table.position),
]);

export const playbackQueue = pgTable('playback_queue', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  mediaItemId: uuid('media_item_id').notNull().references(() => mediaItems.id, { onDelete: 'cascade' }),
  position: integer('position').notNull().default(0),
  addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('playback_queue_user_item_unique').on(table.userId, table.mediaItemId),
  index('playback_queue_user_position_index').on(table.userId, table.position),
]);

export const recommendationEdges = pgTable('recommendation_edges', {
  sourceMediaItemId: uuid('source_media_item_id').notNull().references(() => mediaItems.id, { onDelete: 'cascade' }),
  recommendedMediaItemId: uuid('recommended_media_item_id').notNull().references(() => mediaItems.id, { onDelete: 'cascade' }),
  position: integer('position').notNull().default(0),
  providerSource: text('provider_source').notNull().default('tmdb'),
  ...timestamps,
}, (table) => [
  uniqueIndex('recommendation_edges_source_recommended_unique').on(table.sourceMediaItemId, table.recommendedMediaItemId),
  index('recommendation_edges_source_position_index').on(table.sourceMediaItemId, table.position),
  index('recommendation_edges_recommended_id_index').on(table.recommendedMediaItemId),
]);

export const playbackProgress = pgTable('playback_progress', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  mediaItemId: uuid('media_item_id').notNull().references(() => mediaItems.id, { onDelete: 'cascade' }),
  positionSeconds: integer('position_seconds').notNull().default(0),
  watched: boolean('watched').notNull().default(false),
  lastWatchedAt: timestamp('last_watched_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('playback_progress_user_media_unique').on(table.userId, table.mediaItemId),
  index('playback_progress_user_recent_index').on(table.userId, table.lastWatchedAt),
]);

export const watchlistEntries = pgTable('watchlist_entries', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  mediaItemId: uuid('media_item_id').notNull().references(() => mediaItems.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('watchlist_entries_user_media_unique').on(table.userId, table.mediaItemId),
  index('watchlist_entries_user_recent_index').on(table.userId, table.createdAt),
]);

export const mediaSubtitles = pgTable('media_subtitles', {
  id: uuid('id').primaryKey().defaultRandom(),
  mediaFileId: uuid('media_file_id').notNull().references(() => mediaFiles.id, { onDelete: 'cascade' }),
  streamIndex: integer('stream_index').notNull(),
  language: text('language'),
  label: text('label').notNull(),
  forced: boolean('forced').notNull().default(false),
  /** Filename of the extracted WebVTT file inside the subtitles store. */
  storageKey: text('storage_key').notNull(),
  source: text('source').notNull().default('embedded'),
  /** Shift applied to align this track with the audio; null when never synced. */
  syncOffsetMs: integer('sync_offset_ms'),
  /** Time stretch applied with the shift, for PAL/NTSC drift. */
  syncScale: real('sync_scale'),
  /** How well the aligned cues matched the speech, 0..1. */
  syncConfidence: real('sync_confidence'),
  syncedAt: timestamp('synced_at', { withTimezone: true }),
  /** Sidecar path relative to its library root, for re-import after an edit. */
  sourcePath: text('source_path'),
  ...timestamps,
}, (table) => [
  uniqueIndex('media_subtitles_file_stream_unique').on(table.mediaFileId, table.streamIndex),
  index('media_subtitles_file_index').on(table.mediaFileId),
]);

export const scanRuns = pgTable('scan_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  libraryId: uuid('library_id').notNull().references(() => libraries.id, { onDelete: 'cascade' }),
  status: scanStatus('status').notNull().default('queued'),
  discoveredFiles: integer('discovered_files').notNull().default(0),
  processedFiles: integer('processed_files').notNull().default(0),
  failedFiles: integer('failed_files').notNull().default(0),
  error: text('error'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  heartbeatAt: timestamp('heartbeat_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('scan_runs_library_created_index').on(table.libraryId, table.createdAt),
  uniqueIndex('scan_runs_one_active_per_library_unique').on(table.libraryId).where(sql`${table.status} in ('queued', 'running')`),
]);

export const pluginConfigurations = pgTable('plugin_configurations', {
  pluginId: text('plugin_id').primaryKey(),
  enabled: boolean('enabled').notNull().default(false),
  schedule: text('schedule'),
  settings: jsonb('settings').$type<Record<string, unknown>>().notNull().default({}),
  nextRunAt: timestamp('next_run_at', { withTimezone: true }),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  lastRunStatus: pluginRunStatus('last_run_status'),
  lastRunDurationMs: integer('last_run_duration_ms'),
  lastRunSummary: text('last_run_summary'),
  lastRunError: text('last_run_error'),
  ...timestamps,
});

export const pluginRuns = pgTable('plugin_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  pluginId: text('plugin_id').notNull().references(() => pluginConfigurations.pluginId, { onDelete: 'cascade' }),
  status: pluginRunStatus('status').notNull().default('running'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  durationMs: integer('duration_ms'),
  summary: text('summary'),
  error: text('error'),
}, (table) => [
  index('plugin_runs_plugin_started_index').on(table.pluginId, table.startedAt),
  uniqueIndex('plugin_runs_one_active_per_plugin_unique').on(table.pluginId).where(sql`${table.status} = 'running'`),
]);

export const mediaTrailers = pgTable('media_trailers', {
  id: uuid('id').primaryKey().defaultRandom(),
  mediaItemId: uuid('media_item_id').notNull().references(() => mediaItems.id, { onDelete: 'cascade' }),
  providerSource: text('provider_source').notNull().default('tmdb'),
  providerId: text('provider_id').notNull(), site: text('site').notNull(), key: text('key').notNull(),
  name: text('name').notNull(), type: text('type').notNull(), official: boolean('official').notNull().default(false),
  language: text('language'), country: text('country'), publishedAt: timestamp('published_at', { withTimezone: true }),
  preferred: boolean('preferred').notNull().default(false),
  localPath: text('local_path'), downloadedAt: timestamp('downloaded_at', { withTimezone: true }),
  status: text('status').notNull().default('metadata'), ...timestamps,
}, (table) => [
  uniqueIndex('media_trailers_item_provider_unique').on(table.mediaItemId, table.providerSource, table.providerId),
  index('media_trailers_item_preferred_index').on(table.mediaItemId, table.preferred),
]);
