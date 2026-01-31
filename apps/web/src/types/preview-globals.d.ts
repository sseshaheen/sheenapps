declare global {
  interface Window {
    __sheenappsPreviewReady?: (api: {
      containerId: string;
      props: any;
    }) => void;
    __sheenappsRender?: (props: any) => void;
    __sheenappsRoot?: {
      unmount?: () => void;
    };
  }
}

export {};