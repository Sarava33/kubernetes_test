import type { NextApiRequest, NextApiResponse } from "next";
import { exec } from "child_process";
import { promisify } from "util";
import jwt from "jsonwebtoken";

const execAsync = promisify(exec);

interface DecodedToken {
  sub: string;
  preferred_username: string;
  email: string;
  realm_access?: {
    roles: string[];
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Check Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized - No token provided" });
  }

  const token = authHeader.split(" ")[1];

  try {
    // Decode the Keycloak token
    const decodedToken = jwt.decode(token) as DecodedToken;
    
    if (!decodedToken) {
      return res.status(401).json({ error: "Invalid token" });
    }

    console.log("User accessing K8s:", decodedToken.preferred_username);

    // Use kubectl directly to get pod information
    console.log("Executing: kubectl get pods -n default -o json");
    
    const { stdout, stderr } = await execAsync(
      'kubectl get pods -n default -o json',
      { timeout: 10000 } // 10 second timeout
    );

    if (stderr && stderr.trim() !== '') {
      console.error("kubectl stderr:", stderr);
      // Don't fail on warnings, only on actual errors
      if (stderr.toLowerCase().includes('error') || stderr.toLowerCase().includes('failed')) {
        return res.status(500).json({ 
          error: "kubectl command failed", 
          details: stderr 
        });
      }
    }

    console.log("kubectl executed successfully");
    
    const kubeResponse = JSON.parse(stdout);
    console.log("Found", kubeResponse.items.length, "pods");
    
    // Extract pod information
    const pods = kubeResponse.items.map((pod: any) => {
      const containerStatuses = pod.status?.containerStatuses || [];
      const restartCount = containerStatuses.reduce((sum: number, container: any) => 
        sum + (container.restartCount || 0), 0);
      
      const readyCount = containerStatuses.filter((container: any) => container.ready).length;
      const totalContainers = containerStatuses.length;
      
      return {
        name: pod.metadata?.name || "unknown",
        namespace: pod.metadata?.namespace || "default",
        status: pod.status?.phase || "unknown",
        ready: `${readyCount}/${totalContainers}`,
        restarts: restartCount,
        age: pod.metadata?.creationTimestamp ? 
          Math.floor((Date.now() - new Date(pod.metadata.creationTimestamp).getTime()) / (1000 * 60)) : 0,
        image: pod.spec?.containers?.[0]?.image || "unknown",
        node: pod.spec?.nodeName || "unknown",
        createdAt: pod.metadata?.creationTimestamp || null
      };
    });

    console.log("Successfully processed pod data");

    return res.status(200).json({ 
      success: true,
      pods,
      user: decodedToken.preferred_username,
      namespace: "default",
      totalPods: pods.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Error fetching pods:", error);
    
    if (error instanceof Error) {
      console.error("Error details:", error.message);
      
      // Handle specific errors
      if (error.message.includes('spawn kubectl ENOENT')) {
        return res.status(500).json({ 
          error: "kubectl not found", 
          details: "Make sure kubectl is installed and in your PATH"
        });
      }
      
      if (error.message.includes('timeout')) {
        return res.status(500).json({ 
          error: "kubectl command timed out", 
          details: "Kubernetes cluster might be slow to respond"
        });
      }
      
      if (error.message.includes('connection refused')) {
        return res.status(500).json({ 
          error: "Cannot connect to Kubernetes cluster", 
          details: "Make sure Minikube is running"
        });
      }
      
      return res.status(500).json({ 
        error: "Failed to fetch pods", 
        details: error.message 
      });
    }
    
    return res.status(500).json({ error: "Failed to fetch pods" });
  }
}