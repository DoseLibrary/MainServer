import { createBrowserRouter, type RouteObject } from 'react-router-dom';
import { Home } from '@/routes/Home';
import { CatalogDetails } from '@/routes/CatalogDetails';
import { Watch } from '@/routes/Watch';
import { Profile } from '@/routes/Profile';
import { PersonPage } from '@/routes/PersonPage';
import { GenrePage } from '@/routes/GenrePage';
import { CategoriesPage } from '@/routes/CategoriesPage';
import { CategoryPage } from '@/routes/CategoryPage';
import { CollectionPage } from '@/routes/CollectionPage';
import { PluginsPage } from '@/routes/PluginsPage';
import { TrailerWatch } from '@/routes/TrailerWatch';

const routes: RouteObject[] = [
  { path: '/', element: <Home /> },
  { path: '/media/:id', element: <CatalogDetails /> },
  { path: '/watch/:id', element: <Watch /> },
  { path: '/trailer/:id', element: <TrailerWatch /> },
  { path: '/person/:id', element: <PersonPage /> },
  { path: '/genre/:id', element: <GenrePage /> },
  { path: '/categories', element: <CategoriesPage /> },
  { path: '/category/:key', element: <CategoryPage /> },
  { path: '/collection/:id', element: <CollectionPage /> },
  { path: '/profile', element: <Profile /> },
  { path: '/profile/plugins', element: <PluginsPage /> },
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
