import { PrivateRoute } from '@/components/PrivateRoute';
import GroupChatPage from '@/views/GroupChatPage';

export default function Groups() {
  return (
    <PrivateRoute>
      <GroupChatPage />
    </PrivateRoute>
  );
}
