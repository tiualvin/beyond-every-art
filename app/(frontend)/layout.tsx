import type { Metadata } from 'next'
import '../globals.css'

export const metadata: Metadata = {
  title: 'Beyond Every Art',
  description: 'Art, color, materials, exhibitions, and creative practice.',
}

export default function FrontendLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children
}
