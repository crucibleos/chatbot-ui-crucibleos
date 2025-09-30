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
      <div className="mb-2 flex h-20 w-20 items-center justify-center">
        <Image 
          src="/icon-512x512.png" 
          alt="Crucible OS"
          width={80}
          height={80}
          priority
          unoptimized
        />
      </div>

      <div className="text-4xl font-bold tracking-wide">Crucible OS</div>
    </Link>
  )
}
