import { Navigate, createBrowserRouter, type RouteObject } from 'react-router-dom';
import { Home } from '@/routes/Home';
import { CatalogDetails } from '@/routes/CatalogDetails';
import { Watch } from '@/routes/Watch';
import { Profile } from '@/routes/Profile';
import { PersonPage } from '@/routes/PersonPage';
import { GenrePage } from '@/routes/GenrePage';
import { CategoriesPage } from '@/routes/CategoriesPage';
import { CategoryPage } from '@/routes/CategoryPage';
import { CollectionPage } from '@/routes/CollectionPage';
import { CollectionsPage } from '@/routes/CollectionsPage';
import { UserCollectionPage } from '@/routes/UserCollectionPage';
import { PluginsPage } from '@/routes/PluginsPage';
import { TranscodingPage } from '@/routes/TranscodingPage';
import { PluginDetailPage } from '@/routes/PluginDetailPage';
import { AdminRoute } from '@/routes/AdminRoute';
import { AdminHome } from '@/routes/AdminHome';
import { ActivityPage } from '@/routes/ActivityPage';
import { LibrariesAdminPage } from '@/routes/LibrariesAdminPage';
import { FamilyAdminPage } from '@/routes/FamilyAdminPage';
import { MediaAdminPage } from '@/routes/MediaAdminPage';
import { UserCollections } from '@/routes/UserCollections';
import { Queue } from '@/routes/Queue';
import { History } from '@/routes/History';
import { Downloads } from '@/routes/Downloads';
import { TrailerWatch } from '@/routes/TrailerWatch';
import { PairDevice } from '@/routes/PairDevice';
import { LinkDevice } from '@/routes/LinkDevice';

const routes: RouteObject[] = [
  { path: '/', element: <Home /> },
  { path: '/media/:id', element: <CatalogDetails /> },
  { path: '/watch/:id', element: <Watch /> },
  { path: '/trailer/:id', element: <TrailerWatch /> },
  { path: '/person/:id', element: <PersonPage /> },
  { path: '/genre/:id', element: <GenrePage /> },
  { path: '/categories', element: <CategoriesPage /> },
  { path: '/category/:key', element: <CategoryPage /> },
  { path: '/collections', element: <CollectionsPage /> },
  { path: '/collection/:id', element: <CollectionPage /> },
  { path: '/my-collection/:id', element: <UserCollectionPage /> },
  { path: '/profile', element: <Profile /> },
  // Device pairing: /pair runs on the device without a keyboard, /link on the phone.
  { path: '/pair', element: <PairDevice /> },
  { path: '/link', element: <LinkDevice /> },
  // Plugin administration moved under /admin; the old path stays as a redirect.
  { path: '/profile/plugins', element: <Navigate to="/admin/plugins" replace /> },
  { path: '/admin', element: <AdminRoute><AdminHome /></AdminRoute> },
  { path: '/admin/activity', element: <AdminRoute><ActivityPage /></AdminRoute> },
  { path: '/admin/libraries', element: <AdminRoute><LibrariesAdminPage /></AdminRoute> },
  { path: '/admin/users', element: <AdminRoute><FamilyAdminPage /></AdminRoute> },
  { path: '/admin/media', element: <AdminRoute><MediaAdminPage /></AdminRoute> },
  { path: '/admin/plugins', element: <AdminRoute><PluginsPage /></AdminRoute> },
  { path: '/admin/transcoding', element: <AdminRoute><TranscodingPage /></AdminRoute> },
  { path: '/admin/plugins/:id', element: <AdminRoute><PluginDetailPage /></AdminRoute> },
  { path: '/profile/collections', element: <UserCollections /> },
  { path: '/profile/queue', element: <Queue /> },
  { path: '/profile/history', element: <History /> },
  // Reachable with no connection: the service worker serves the shell here.
  { path: '/downloads', element: <Downloads /> },
];

// The component gallery is a dev-only tool. Gating the route registration and
// the module import behind import.meta.env.DEV keeps the gallery (and its demo
// code) out of the production bundle entirely.
if (import.meta.env.DEV) {
  routes.push({
    path: '/dev',
    lazy: async () => {
      const { DevGallery } = await import('@/dev/DevGallery');
      return { element: <DevGallery /> };
    },
  });
  routes.push({
    path: '/dev/full',
    lazy: async () => {
      const { DevFullPage } = await import('@/dev/DevFullPage');
      return { element: <DevFullPage /> };
    },
  });
}

export const router = createBrowserRouter(routes);
