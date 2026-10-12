import { createComponent, createSignal } from 'solid-js';
import { PrioritySidebar } from './priority-sidebar.tsx';

const [refreshKey, setRefreshKey] = createSignal(0);

export const refreshPrioritySidebar = (): void => {
  setRefreshKey((value) => value + 1);
};

export const renderPrioritySidebar = () => createComponent(PrioritySidebar, { refreshKey });
