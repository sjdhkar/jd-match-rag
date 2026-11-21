import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "JD Match RAG",
  description: "Paste a job description and see how your resume matches, with grounded AI feedback.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
