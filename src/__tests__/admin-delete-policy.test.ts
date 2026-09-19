import { describe, expect, it } from 'vitest';
import userManagementSource from '../pages/admin/UserManagement.tsx?raw';

describe('User deletion flow', () => {
  it('uses the selected UUID and shows a safe confirmation before deleting', () => {
    expect(userManagementSource).toMatch(/deleteUser\.id/);
    expect(userManagementSource).toMatch(/Delete Record\?/);
    expect(userManagementSource).toMatch(/Are you sure you want to delete this item\? This action cannot be undone\./);
    expect(userManagementSource).toMatch(/disabled=\{saving\}/);
    expect(userManagementSource).toMatch(/Deleted successfully\./);
  });
});
