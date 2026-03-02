"use client";

import dynamic from "next/dynamic";

const NexusID = dynamic(() => import("./NexusID"), {
    ssr: false,
    loading: () => (
        <div style={{
            minHeight: "100vh",
            background: "#000000",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "'Courier New', monospace",
            color: "#00ff41",
            fontSize: 12,
            letterSpacing: 3,
        }}>
            INICIANDO NEXUS ID...
        </div>
    ),
});

export default function NexusIDClient() {
    return <NexusID />;
}