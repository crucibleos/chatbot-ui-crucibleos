"use client"

import { CrucibleSVG } from "../icons/crucible-svg"
import { FC } from "react"

interface BrandProps {
  theme?: "dark" | "light"
}

export const Brand: FC<BrandProps> = ({ theme = "dark" }) => {
  return (
    <div className="flex cursor-pointer flex-col items-center">
      <div className="mb-2">
        <CrucibleSVG theme={theme === "dark" ? "dark" : "light"} scale={0.6} />
      </div>

      <div className="text-center">
        <div className="text-4xl font-bold tracking-wide">Crucible OS</div>
        <div className="text-muted-foreground mt-1 text-sm">
          AI-Powered Business Intelligence
        </div>
      </div>
    </div>
  )
}
