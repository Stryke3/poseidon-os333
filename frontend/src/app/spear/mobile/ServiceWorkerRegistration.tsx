"use client";
import { useEffect } from "react";
export default function ServiceWorkerRegistration() { useEffect(() => { if ("serviceWorker" in navigator) navigator.serviceWorker.register("/spear-sw.js", { scope: "/spear/", updateViaCache: "none" }).then(registration => registration.update()).catch(() => undefined); }, []); return null; }
