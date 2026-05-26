import { Redirect } from 'expo-router';

export default function IndexPage() {
  // Tự động chuyển hướng vào màn hình Đăng nhập Tenant
  return <Redirect href="/(auth)/login" />;
}
