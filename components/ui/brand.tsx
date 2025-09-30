"use client"

import Link from "next/link"
import { FC } from "react"
import Image from "next/image"

interface BrandProps {
  theme?: "dark" | "light"
}

export const Brand: FC<BrandProps> = ({ theme = "dark" }) => {
  return (
    <Link
      className="flex cursor-pointer flex-col items-center hover:opacity-50"
      href="https://crucibleos.com"
      target="_blank"
      rel="noopener noreferrer"
    >
      <div className="mb-2">
        <Image 
          src="/dark-brand-logo.svg" 
          alt="Crucible OS Logo"
          width={120}
          height={40}
          priority
        />
      </div>

      <div className="text-4xl font-bold tracking-wide">Crucible OS</div>
    </Link>
  )
}
