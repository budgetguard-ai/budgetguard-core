import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Tenant, DashboardStore } from "../types";

export const useDashboardStore = create<DashboardStore>()(
  persist(
    (set) => ({
      selectedTenant: null,
      setSelectedTenant: (tenant: Tenant | null) =>
        set({ selectedTenant: tenant }),

      theme: "light",
      toggleTheme: () =>
        set((state) => ({
          theme: state.theme === "light" ? "dark" : "light",
        })),
    }),
    {
      name: "budgetguard-dashboard",
      partialize: (state) => ({
        theme: state.theme,
        selectedTenant: state.selectedTenant,
      }),
    },
  ),
);
