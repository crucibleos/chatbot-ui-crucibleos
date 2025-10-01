import { FC } from "react"

interface CrucibleSVGProps {
  theme?: "dark" | "light"
  scale?: number
  className?: string
}

export const CrucibleSVG: FC<CrucibleSVGProps> = ({
  theme = "dark",
  scale = 1,
  className = ""
}) => {
  const baseSize = 100
  const size = baseSize * scale

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Outer circle/container */}
      <circle
        cx="50"
        cy="50"
        r="45"
        fill={theme === "dark" ? "#1a1a1a" : "#ffffff"}
        stroke={theme === "dark" ? "#00a6f7" : "#0066cc"}
        strokeWidth="2"
      />
      
      {/* Stylized flame/crucible symbol */}
      <path
        d="M50 20 C40 30, 38 40, 40 50 C42 58, 45 62, 50 65 C55 62, 58 58, 60 50 C62 40, 60 30, 50 20 Z"
        fill={theme === "dark" ? "#00a6f7" : "#0066cc"}
      />
      <path
        d="M50 30 C45 38, 44 44, 45 50 C46 54, 48 57, 50 59 C52 57, 54 54, 55 50 C56 44, 55 38, 50 30 Z"
        fill={theme === "dark" ? "#ffffff" : "#ffffff"}
        opacity="0.8"
      />
      <path
        d="M50 40 C48 44, 47 46, 48 50 C48.5 52, 49 53, 50 54 C51 53, 51.5 52, 52 50 C53 46, 52 44, 50 40 Z"
        fill={theme === "dark" ? "#00d4ff" : "#00a6f7"}
      />
      
      {/* Base/bowl of crucible */}
      <path
        d="M35 65 L35 70 Q35 75, 40 75 L60 75 Q65 75, 65 70 L65 65 Z"
        fill={theme === "dark" ? "#2a2a2a" : "#cccccc"}
        stroke={theme === "dark" ? "#00a6f7" : "#0066cc"}
        strokeWidth="1.5"
      />
      <rect
        x="38"
        y="70"
        width="24"
        height="8"
        rx="2"
        fill={theme === "dark" ? "#1a1a1a" : "#999999"}
      />
    </svg>
  )
}
