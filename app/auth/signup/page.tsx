import type { Metadata } from "next";
import MicroEChef from "../../App";
export const metadata: Metadata = { title: "Sign up — Mila Mirissa", robots: { index: false, follow: false } };
export default function Page() { return <MicroEChef key="auth-signup" authPage="signup" />; }
