export interface Permissions {
  settings: {
    access: boolean;
  };
  gramophone: {
    access: boolean;
    manage: boolean;
  };
}

export interface PermissionsContextType {
  permissions: Permissions | null;
  userRole: string | null;
  loading: boolean;
}

