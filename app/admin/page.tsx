import AdminPanel from "./AdminPanel"

export const dynamic = "force-dynamic"
export const maxDuration = 45
export const metadata = { title: "Administração FutScout", robots: { index: false, follow: false } }
export default function AdminPage() { return <AdminPanel /> }
