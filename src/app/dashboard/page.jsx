import { PrivateRoute } from '@/components/PrivateRoute';
import ChatDashboardPage from '@/views/ChatDashboardPage';

export default function Dashboard() {
  return (
    <PrivateRoute>
      <ChatDashboardPage />
    </PrivateRoute>
  );
}
