import { Suspense } from "react";
import { PrivateRoute } from "@/components/PrivateRoute";
import CallUI from "@/components/CallUI";

export default function WebRtcCallPage() {
  return (
    <PrivateRoute>
      <Suspense fallback={<div className="p-8 text-center text-slate-600">Loading...</div>}>
        <CallUI />
      </Suspense>
    </PrivateRoute>
  );
}
