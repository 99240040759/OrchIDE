import React from "react"
import { Icon } from "@/components/ui/Icon"
import { Spinner } from "@/components/ui/spinner"
import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      icons={{
        success: <Icon name="pass" size={14} style={{ color: '#2EA043' }} />,
        info:    <Icon name="info" size={14} />,
        warning: <Icon name="warning" size={14} style={{ color: '#E8AE4C' }} />,
        error:   <Icon name="error" size={14} style={{ color: '#F85149' }} />,
        loading: <Spinner size={14} />,
      }}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-orch-surface group-[.toaster]:text-orch-fg group-[.toaster]:border-orch-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-orch-fg2",
          actionButton:
            "group-[.toast]:bg-orch-accent group-[.toast]:text-white",
          cancelButton:
            "group-[.toast]:bg-orch-hover group-[.toast]:text-orch-fg2",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
