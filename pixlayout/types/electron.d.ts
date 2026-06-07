// pixlayout/types/electron.d.ts
//
// Single source of truth for the window.pixnarr bridge type.
// TypeScript automatically picks up all .d.ts files — no import needed.

export {};   // makes this a module so the global augmentation is properly scoped

declare global {
  interface Window {
    pixnarr?: {
      isElectron: boolean;

      /** Get all saved settings from preferences.conf */
      getSettings: () => Promise<{
        GROQ_API_KEY:          string;
        WORKER_AI_ACCOUNT_API: string;
        backendPort:           number;
        frontendPort:          number;
        startupWaitSeconds:    number;
      }>;

      /** Save settings back to preferences.conf */
      saveSettings: (data: {
        GROQ_API_KEY:          string;
        WORKER_AI_ACCOUNT_API: string;
        backendPort:           number;
        frontendPort:          number;
        startupWaitSeconds:    number;
      }) => Promise<{ ok: boolean }>;

      /** Validate current settings */
      validateSettings: () => Promise<{
        valid:   boolean;
        missing: string[];
      }>;

      /** Open native save dialog */
      saveFileDialog: (opts?: {
        defaultName?: string;
        filters?:     { name: string; extensions: string[] }[];
      }) => Promise<string | null>;
    };
  }
}