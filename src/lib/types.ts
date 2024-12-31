export interface Window {
  OnLogon: () => void;
  __NEXT_DATA__: {
    props: {
      pageProps: {
        foodResponse: {
          fileGroupId: string;
          fileId: string;
        };
        profile: {
          token: {
            accessToken: string;
          };
        };
      };
    };
  };
}

export interface MenuRecord {
  id: string;
  file_name: string;
  upload_date: string;
  storage_path: string;
  created_at: string;
}
