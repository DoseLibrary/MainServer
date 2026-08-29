import { createBrowserRouter, type RouteObject } from 'react-router-dom';
import { Home } from '@/routes/Home';
import { CatalogDetails } from '@/routes/CatalogDetails';
import { Watch } from '@/routes/Watch';
import { Profile } from '@/routes/Profile';
import { PersonPage } from '@/routes/PersonPage';

const routes: RouteObject[] = [
  { path: '/', element: <Home /> },
  { path: '/media/:id', element: <CatalogDetails /> },
  { path: '/watch/:id', element: <Watch /> },
  { path: '/person/:id', element: <PersonPage /> },
  { path: '/profile', element: <Profile /> },
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
