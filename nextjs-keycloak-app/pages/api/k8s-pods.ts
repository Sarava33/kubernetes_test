// pages/api/k8s-pods.ts

import type { NextApiRequest, NextApiResponse } from "next";
import { getToken } from "next-auth/jwt";
import * as k8s from "@kubernetes/client-node";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const kc = new k8s.KubeConfig();
    kc.loadFromDefault();

    const k8sApi = kc.makeApiClient(k8s.CoreV1Api);

    const response = await k8sApi.listNamespacedPod({ namespace: "default" });

    const items = (response as any).body?.items || [];

    const pods = items.map((pod: any) => ({
      name: pod.metadata?.name ?? "unknown",
      status: pod.status?.phase ?? "unknown",
    }));

    return res.status(200).json({ pods });
  } catch (error: any) {
    console.error("Error fetching pods:", error);
    return res.status(500).json({ error: error.message || "Unknown error" });
  }
}
