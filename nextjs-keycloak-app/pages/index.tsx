import { useSession, signIn, signOut } from "next-auth/react";
import { useEffect, useState } from "react";

type Pod = {
  name: string;
  status: string;
};

export default function Home() {
  const { data: session } = useSession();
  const [pods, setPods] = useState<Pod[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (session) {
      setLoading(true);
      fetch("/api/k8s-pods")
        .then((res) => res.json())
        .then((data) => {
          console.log("Received data from API:", data);
          setPods(data.pods);
          setLoading(false);
        })
        .catch((err) => {setLoading(false)
            console.error("Failed to fetch pods:", err);
        });
    }
  }, [session]);

  if (!session) {
    return (
      <div style={{ padding: "2rem" }}>
        <h1>You are not signed in</h1>
        <button onClick={() => signIn("keycloak")}>Sign in with Keycloak</button>
      </div>
    );
  }

  return (
    <div style={{ padding: "2rem" }}>
      <h1>Welcome, {session.user?.name || "User"}!</h1>
      <p>Email: {session.user?.email}</p>
      <button onClick={() => signOut()}>Sign out</button>

      <h2>Pods Status</h2>
      {loading && <p>Loading pods...</p>}
      {!loading && pods && (
        <ul>
          {pods.map((pod) => (
            <li key={pod.name}>
              {pod.name}: {pod.status}
            </li>
          ))}
        </ul>
      )}
      {!loading && !pods && <p>No pods found.</p>}
    </div>
  );
}
