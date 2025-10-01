"use client"

import { CrucibleSVG } from "@/components/icons/crucible-svg"
import { IconArrowRight } from "@tabler/icons-react"
import { useTheme } from "next-themes"
import Link from "next/link"

export default function HomePage() {
  const { theme } = useTheme()

  return (
    <div className="flex size-full flex-col items-center justify-center">
      <div>
        <CrucibleSVG theme={theme === "dark" ? "dark" : "light"} scale={0.8} />
      </div>

      <div className="mt-4 text-center">
        <div className="text-5xl font-bold tracking-wide">Crucible OS</div>
        <div className="text-muted-foreground mt-2 text-lg">
          AI-Powered Business Intelligence
        </div>
      </div>

      <Link
        className="mt-8 flex w-[200px] items-center justify-center rounded-md bg-blue-600 p-2 font-semibold transition-all hover:bg-blue-700"
        href="/login"
      >
        Start Chatting
        <IconArrowRight className="ml-1" size={20} />
      </Link>
    </div>
  )
}
