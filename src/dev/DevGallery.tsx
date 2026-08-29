import { componentCatalog } from './componentCatalog';
import { pageCatalog } from './pageCatalog';
import { ComponentExample } from './components/ComponentExample';
import { PageExample } from './components/PageExample';
import { DevDocsShell, type DevDocsItem } from './components/DevDocsShell';

const componentItems: readonly DevDocsItem[] = componentCatalog.map((item) => ({
  key: item.id,
  label: item.name,
  group: item.category,
  content: <ComponentExample title={item.name} description={item.description} source={item.source}>{item.preview}</ComponentExample>,
}));

const pageItems: readonly DevDocsItem[] = pageCatalog.map((item) => ({
  key: item.id,
  label: item.name,
  group: 'Pages',
  content: <PageExample id={item.id} title={item.name} description={item.description} source={item.source}>{item.preview}</PageExample>,
}));

const items: readonly DevDocsItem[] = [...componentItems, ...pageItems];

export function DevGallery() { return <DevDocsShell items={items} />; }
