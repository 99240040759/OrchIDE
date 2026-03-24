import { create } from 'zustand';

interface LayoutState {
  isLeftSidebarOpen: boolean;
  isRightSidebarOpen: boolean;
  isEditorOpen: boolean;
  toggleLeftSidebar: () => void;
  toggleRightSidebar: () => void;
  toggleEditor: () => void;
  setLeftSidebarOpen: (isOpen: boolean) => void;
  setRightSidebarOpen: (isOpen: boolean) => void;
  setEditorOpen: (isOpen: boolean) => void;
}

export const useLayoutStore = create<LayoutState>((set) => ({
  isLeftSidebarOpen: false,
  isRightSidebarOpen: false,
  isEditorOpen: false,
  toggleLeftSidebar: () => set((state) => ({ isLeftSidebarOpen: !state.isLeftSidebarOpen })),
  toggleRightSidebar: () => set((state) => ({ isRightSidebarOpen: !state.isRightSidebarOpen })),
  toggleEditor: () => set((state) => ({ isEditorOpen: !state.isEditorOpen })),
  setLeftSidebarOpen: (isOpen) => set({ isLeftSidebarOpen: isOpen }),
  setRightSidebarOpen: (isOpen) => set({ isRightSidebarOpen: isOpen }),
  setEditorOpen: (isOpen) => set({ isEditorOpen: isOpen }),
}));
