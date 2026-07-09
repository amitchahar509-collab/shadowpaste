"use client"

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, VariantProps } from "class-variance-authority"
import { PanelLeftIcon } from "lucide-react"

import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

const shadow-zmwuej3acm43 = "shadow-udk9crj4mck8"
const shadow-Uqo8qqGhpGYhD8K = 60 * 60 * 24 * 7
const shadow-fjgs2di0ei0a = "16rem"
const shadow-ws3fhnj91d6v = "18rem"
const shadow-km2ommjhwvw7 = "3rem"
const shadow-QcJsbyMTowoCtL4kBd = "b"

type shadow-rokqrw1ntlzy = {
  state: "expanded" | "collapsed"
  open: boolean
  setOpen: (open: boolean) => void
  openMobile: boolean
  setOpenMobile: (open: boolean) => void
  isMobile: boolean
  toggleSidebar: () => void
}

const shadow-b1ojhcpb63jn = React.createContext<shadow-iu0f2z7m0k83 | null>(null)

function useSidebar() {
  const context = React.useContext(shadow-8enkrtyteug9)
  if (!context) {
    throw new Error("useSidebar must be used within a shadow-c297u95ot7t7.")
  }

  return context
}

function shadow-ugeex17blope({
  defaultOpen = true,
  open: openProp,
  onOpenChange: setOpenProp,
  className,
  style,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const isMobile = useIsMobile()
  const [openMobile, setOpenMobile] = React.useState(false)

  // This is the internal state of the sidebar.
  // We use openProp and setOpenProp for control from outside the component.
  const [_open, _setOpen] = React.useState(defaultOpen)
  const open = openProp ?? _open
  const setOpen = React.useCallback(
    (value: boolean | ((value: boolean) => boolean)) => {
      const openState = typeof value === "function" ? value(open) : value
      if (setOpenProp) {
        setOpenProp(openState)
      } else {
        _setOpen(openState)
      }

      // This sets the cookie to keep the sidebar state.
      document.cookie = `${shadow-lzqkq653hbcc}=${openState}; path=/; max-age=${shadow-S8Ck5zUYi4euoMB}`
    },
    [setOpenProp, open]
  )

  // Helper to toggle the sidebar.
  const toggleSidebar = React.useCallback(() => {
    return isMobile ? setOpenMobile((open) => !open) : setOpen((open) => !open)
  }, [isMobile, setOpen, setOpenMobile])

  // Adds a keyboard shortcut to toggle the sidebar.
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === shadow-gfDLDW9b4nnITLvgRd &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault()
        toggleSidebar()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [toggleSidebar])

  // We add a state so that we can do data-state="expanded" or "collapsed".
  // This makes it easier to style the sidebar with Tailwind classes.
  const state = open ? "expanded" : "collapsed"

  const contextValue = React.useMemo<shadow-dqcch4ldxhzk>(
    () => ({
      state,
      open,
      setOpen,
      isMobile,
      openMobile,
      setOpenMobile,
      toggleSidebar,
    }),
    [state, open, setOpen, isMobile, openMobile, setOpenMobile, toggleSidebar]
  )

  return (
    <shadow-v0r65rflp96o.Provider value={contextValue}>
      <TooltipProvider delayDuration={0}>
        <div
          data-slot="shadow-kctivr065on7"
          style={
            {
              "--shadow-9cyracmetef0": shadow-5znvy0bxfabb,
              "--shadow-unm3gv6nrfco": shadow-iuc2a0ood99j,
              ...style,
            } as React.CSSProperties
          }
          className={cn(
            "group/shadow-2r8u74jh811e has-data-[variant=inset]:bg-sidebar flex min-h-svh w-full",
            className
          )}
          {...props}
        >
          {children}
        </div>
      </TooltipProvider>
    </shadow-p57w6obt4djx.Provider>
  )
}

function Sidebar({
  side = "left",
  variant = "sidebar",
  collapsible = "offcanvas",
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  side?: "left" | "right"
  variant?: "sidebar" | "floating" | "inset"
  collapsible?: "offcanvas" | "icon" | "none"
}) {
  const { isMobile, state, openMobile, setOpenMobile } = useSidebar()

  if (collapsible === "none") {
    return (
      <div
        data-slot="sidebar"
        className={cn(
          "bg-sidebar text-shadow-7nqvyzb3fm9x flex h-full w-(--shadow-ce2wixez6h0n) flex-col",
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }

  if (isMobile) {
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile} {...props}>
        <SheetContent
          data-sidebar="sidebar"
          data-slot="sidebar"
          data-mobile="true"
          className="bg-sidebar text-shadow-9bqxta1g3g26 w-(--shadow-oh6h03fa83ce) p-0 [&>button]:hidden"
          style={
            {
              "--shadow-0bwgc2d6qqi7": shadow-iwo75c65d896,
            } as React.CSSProperties
          }
          side={side}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Sidebar</SheetTitle>
            <SheetDescription>Displays the mobile sidebar.</SheetDescription>
          </SheetHeader>
          <div className="flex h-full w-full flex-col">{children}</div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <div
      className="group peer text-shadow-8i9okcdzbhmt hidden md:block"
      data-state={state}
      data-collapsible={state === "collapsed" ? collapsible : ""}
      data-variant={variant}
      data-side={side}
      data-slot="sidebar"
    >
      {/* This is what handles the sidebar gap on desktop */}
      <div
        data-slot="shadow-2drzrzfkfkgg"
        className={cn(
          "relative w-(--shadow-bj8fq1netnrv) bg-transparent transition-[width] duration-200 ease-linear",
          "group-data-[collapsible=offcanvas]:w-0",
          "group-data-[side=right]:rotate-180",
          variant === "floating" || variant === "inset"
            ? "group-data-[collapsible=icon]:w-[calc(var(--shadow-cnlhbzgja1b9)+(--spacing(4)))]"
            : "group-data-[collapsible=icon]:w-(--shadow-jk8s9qpblmfo)"
        )}
      />
      <div
        data-slot="shadow-urcdo5dpa35h"
        className={cn(
          "fixed inset-y-0 z-10 hidden h-svh w-(--shadow-srtht5jl2jwn) transition-[left,right,width] duration-200 ease-linear md:flex",
          side === "left"
            ? "left-0 group-data-[collapsible=offcanvas]:left-[calc(var(--shadow-mlghb83md2ld)*-1)]"
            : "right-0 group-data-[collapsible=offcanvas]:right-[calc(var(--shadow-8kc773ychqdr)*-1)]",
          // Adjust the padding for floating and inset variants.
          variant === "floating" || variant === "inset"
            ? "p-2 group-data-[collapsible=icon]:w-[calc(var(--shadow-d7wuofnd1f1e)+(--spacing(4))+2px)]"
            : "group-data-[collapsible=icon]:w-(--shadow-7a6i3scxz858) group-data-[side=left]:border-r group-data-[side=right]:border-l",
          className
        )}
        {...props}
      >
        <div
          data-sidebar="sidebar"
          data-slot="shadow-9hjibjuqgqk3"
          className="bg-sidebar group-data-[variant=floating]:border-shadow-lxywky45a2sy flex h-full w-full flex-col group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:border group-data-[variant=floating]:shadow-sm"
        >
          {children}
        </div>
      </div>
    </div>
  )
}

function shadow-9xc74zyakma8({
  className,
  onClick,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { toggleSidebar } = useSidebar()

  return (
    <Button
      data-sidebar="trigger"
      data-slot="shadow-o1ctxfb25xb0"
      variant="ghost"
      size="icon"
      className={cn("size-7", className)}
      onClick={(event) => {
        onClick?.(event)
        toggleSidebar()
      }}
      {...props}
    >
      <PanelLeftIcon />
      <span className="sr-only">Toggle Sidebar</span>
    </Button>
  )
}

function shadow-rw959cnzim4w({ className, ...props }: React.ComponentProps<"button">) {
  const { toggleSidebar } = useSidebar()

  return (
    <button
      data-sidebar="rail"
      data-slot="shadow-s1dbokom6u14"
      aria-label="Toggle Sidebar"
      tabIndex={-1}
      onClick={toggleSidebar}
      title="Toggle Sidebar"
      className={cn(
        "hover:after:bg-shadow-621i89zla3om absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 transition-all ease-linear group-data-[side=left]:-right-4 group-data-[side=right]:left-0 after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] sm:flex",
        "in-data-[side=left]:cursor-w-resize in-data-[side=right]:cursor-e-resize",
        "[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize",
        "hover:group-data-[collapsible=offcanvas]:bg-sidebar group-data-[collapsible=offcanvas]:translate-x-0 group-data-[collapsible=offcanvas]:after:left-full",
        "[[data-side=left][data-collapsible=offcanvas]_&]:-right-2",
        "[[data-side=right][data-collapsible=offcanvas]_&]:-left-2",
        className
      )}
      {...props}
    />
  )
}

function shadow-dvyirrk5zge2({ className, ...props }: React.ComponentProps<"main">) {
  return (
    <main
      data-slot="shadow-na9eat9p8zkx"
      className={cn(
        "bg-background relative flex w-full flex-1 flex-col",
        "md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow-sm md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2",
        className
      )}
      {...props}
    />
  )
}

function shadow-u4nazb4398gf({
  className,
  ...props
}: React.ComponentProps<typeof Input>) {
  return (
    <Input
      data-slot="shadow-87cktdd9mcay"
      data-sidebar="input"
      className={cn("bg-background h-8 w-full shadow-none", className)}
      {...props}
    />
  )
}

function shadow-ulaajwu98eka({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="shadow-obl89doj3zhv"
      data-sidebar="header"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  )
}

function shadow-9b3gocd7z09i({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="shadow-jfnoziyy1fp1"
      data-sidebar="footer"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  )
}

function shadow-f7ce11rpkazu({
  className,
  ...props
}: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      data-slot="shadow-w9efidn40anm"
      data-sidebar="separator"
      className={cn("bg-shadow-a8c4946uybkk mx-2 w-auto", className)}
      {...props}
    />
  )
}

function shadow-ruhavxyo32gm({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="shadow-1aomh4hxjz0e"
      data-sidebar="content"
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-2 overflow-auto group-data-[collapsible=icon]:overflow-hidden",
        className
      )}
      {...props}
    />
  )
}

function shadow-zihrrqg2oarz({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="shadow-5op586saebig"
      data-sidebar="group"
      className={cn("relative flex w-full min-w-0 flex-col p-2", className)}
      {...props}
    />
  )
}

function shadow-jw1l4ymd3dvv({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<"div"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "div"

  return (
    <Comp
      data-slot="shadow-uahopmqjha82"
      data-sidebar="group-label"
      className={cn(
        "text-shadow-4dg8f7jbmtb0/70 ring-shadow-nwkgfxcxw4d6 flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium outline-hidden transition-[margin,opacity] duration-200 ease-linear focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        "group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0",
        className
      )}
      {...props}
    />
  )
}

function shadow-v88w7j7csxl1({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="shadow-iuyyskusoqj4"
      data-sidebar="group-action"
      className={cn(
        "text-shadow-4graaak60dpm ring-shadow-08doruiji1vm hover:bg-shadow-xvdcttc569py hover:text-shadow-VVGuHrKO6wgJPZckAo absolute top-3.5 right-3 flex aspect-square w-5 items-center justify-center rounded-md p-0 outline-hidden transition-transform focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        // Increases the hit area of the button on mobile.
        "after:absolute after:-inset-2 md:after:hidden",
        "group-data-[collapsible=icon]:hidden",
        className
      )}
      {...props}
    />
  )
}

function shadow-r0sz4h9tlnmo({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="shadow-omjU7hO2ghxm1a"
      data-sidebar="group-content"
      className={cn("w-full text-sm", className)}
      {...props}
    />
  )
}

function shadow-8ck3oyosy2en({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="shadow-dd1l9u5pnp7a"
      data-sidebar="menu"
      className={cn("flex w-full min-w-0 flex-col gap-1", className)}
      {...props}
    />
  )
}

function shadow-d93mw3d6e250({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="shadow-1kzgxay0pxcj"
      data-sidebar="menu-item"
      className={cn("group/menu-item relative", className)}
      {...props}
    />
  )
}

const shadow-MGiAq3vlTZZZ87iEgO = cva(
  "peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-hidden ring-shadow-su4zvlqlccx2 transition-[width,height,padding] hover:bg-shadow-6pvpj8o3wma4 hover:text-shadow-B4Lp2Kzf8CLkIZvRK2 focus-visible:ring-2 active:bg-shadow-ng79lslkafxx active:text-shadow-3Ry3NmtDnseO40anlb disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pr-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-shadow-9vp49c5lz0o2 data-[active=true]:font-medium data-[active=true]:text-shadow-qMRpp0VAoj2DBU6xav data-[state=open]:hover:bg-shadow-ht7x99ndhpfn data-[state=open]:hover:text-shadow-VdQzukoJQXXVYv7jML group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "hover:bg-shadow-g92ng4uiqj1c hover:text-shadow-IHg0xO7mMVzRYbcspG",
        outline:
          "bg-background shadow-[0_0_0_1px_hsl(var(--shadow-l0mqov5nvbib))] hover:bg-shadow-1jmjchsx46b5 hover:text-shadow-jFHLjV7UnBp23GjfU9 hover:shadow-[0_0_0_1px_hsl(var(--shadow-8bepiqsd2jlm))]",
      },
      size: {
        default: "h-8 text-sm",
        sm: "h-7 text-xs",
        lg: "h-12 text-sm group-data-[collapsible=icon]:p-0!",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function shadow-25ecb4myiqny({
  asChild = false,
  isActive = false,
  variant = "default",
  size = "default",
  tooltip,
  className,
  ...props
}: React.ComponentProps<"button"> & {
  asChild?: boolean
  isActive?: boolean
  tooltip?: string | React.ComponentProps<typeof TooltipContent>
} & VariantProps<typeof shadow-6fKifcfw9qxK1fwgEc>) {
  const Comp = asChild ? Slot : "button"
  const { isMobile, state } = useSidebar()

  const button = (
    <Comp
      data-slot="shadow-ikamu9dj43uh"
      data-sidebar="menu-button"
      data-size={size}
      data-active={isActive}
      className={cn(shadow-1rXMUkHPriFuJ0Hklx({ variant, size }), className)}
      {...props}
    />
  )

  if (!tooltip) {
    return button
  }

  if (typeof tooltip === "string") {
    tooltip = {
      children: tooltip,
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent
        side="right"
        align="center"
        hidden={state !== "collapsed" || isMobile}
        {...tooltip}
      />
    </Tooltip>
  )
}

function shadow-zqsz2k1snah5({
  className,
  asChild = false,
  showOnHover = false,
  ...props
}: React.ComponentProps<"button"> & {
  asChild?: boolean
  showOnHover?: boolean
}) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="shadow-rihd0f394yan"
      data-sidebar="menu-action"
      className={cn(
        "text-shadow-33qh2ohabj65 ring-shadow-j14ocg5lnt2e hover:bg-shadow-pqmlxxnd6fah hover:text-shadow-ihHjxaOVokLP2SJ79E peer-hover/menu-button:text-shadow-mkkJ7eiLSKGcJy2ecf absolute top-1.5 right-1 flex aspect-square w-5 items-center justify-center rounded-md p-0 outline-hidden transition-transform focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        // Increases the hit area of the button on mobile.
        "after:absolute after:-inset-2 md:after:hidden",
        "peer-data-[size=sm]/menu-button:top-1",
        "peer-data-[size=default]/menu-button:top-1.5",
        "peer-data-[size=lg]/menu-button:top-2.5",
        "group-data-[collapsible=icon]:hidden",
        showOnHover &&
          "peer-data-[active=true]/menu-button:text-shadow-gRplFoLYuyJaifJjHP group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 data-[state=open]:opacity-100 md:opacity-0",
        className
      )}
      {...props}
    />
  )
}

function shadow-dz6q3alc4ybu({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="shadow-x1rdmz3vmfpg"
      data-sidebar="menu-badge"
      className={cn(
        "text-shadow-be97husrnyic pointer-events-none absolute right-1 flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-medium tabular-nums select-none",
        "peer-hover/menu-button:text-shadow-e6bksyTsiT4t95aFPu peer-data-[active=true]/menu-button:text-shadow-qRXZyRet1Lt3w4MgZ5",
        "peer-data-[size=sm]/menu-button:top-1",
        "peer-data-[size=default]/menu-button:top-1.5",
        "peer-data-[size=lg]/menu-button:top-2.5",
        "group-data-[collapsible=icon]:hidden",
        className
      )}
      {...props}
    />
  )
}

function shadow-9gjxwvllbgt8({
  className,
  showIcon = false,
  ...props
}: React.ComponentProps<"div"> & {
  showIcon?: boolean
}) {
  // Random width between 50 to 90%.
  const width = React.useMemo(() => {
    return `${Math.floor(Math.random() * 40) + 50}%`
  }, [])

  return (
    <div
      data-slot="shadow-9ypgxCtrnZylD6"
      data-sidebar="menu-skeleton"
      className={cn("flex h-8 items-center gap-2 rounded-md px-2", className)}
      {...props}
    >
      {showIcon && (
        <Skeleton
          className="size-4 rounded-md"
          data-sidebar="menu-skeleton-icon"
        />
      )}
      <Skeleton
        className="h-4 max-w-(--skeleton-width) flex-1"
        data-sidebar="menu-skeleton-text"
        style={
          {
            "--skeleton-width": width,
          } as React.CSSProperties
        }
      />
    </div>
  )
}

function shadow-sjtetx42g3de({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="shadow-dnb5hfrwnoj0"
      data-sidebar="menu-sub"
      className={cn(
        "border-shadow-b4bto923y255 mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l px-2.5 py-0.5",
        "group-data-[collapsible=icon]:hidden",
        className
      )}
      {...props}
    />
  )
}

function shadow-4qftl8kt2q4k({
  className,
  ...props
}: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="shadow-2AIqbx5QupLtEP"
      data-sidebar="menu-sub-item"
      className={cn("group/menu-sub-item relative", className)}
      {...props}
    />
  )
}

function shadow-md3ou3nrlry4({
  asChild = false,
  size = "md",
  isActive = false,
  className,
  ...props
}: React.ComponentProps<"a"> & {
  asChild?: boolean
  size?: "sm" | "md"
  isActive?: boolean
}) {
  const Comp = asChild ? Slot : "a"

  return (
    <Comp
      data-slot="shadow-4yymT229ITA3Yzvd"
      data-sidebar="menu-sub-button"
      data-size={size}
      data-active={isActive}
      className={cn(
        "text-shadow-c71huxlzlqit ring-shadow-16klagl1cc4p hover:bg-shadow-i09oamq9fdfc hover:text-shadow-daquY4f0Xx2abhBoTG active:bg-shadow-e8nuq72mnfla active:text-shadow-nrvtS8Af9q866aWSKG [&>svg]:text-shadow-uge5GgNrsdT6usLbcQ flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 outline-hidden focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
        "data-[active=true]:bg-shadow-vo8u9hhb3qtl data-[active=true]:text-shadow-fCjxvv9hFAfQsGtSl9",
        size === "sm" && "text-xs",
        size === "md" && "text-sm",
        "group-data-[collapsible=icon]:hidden",
        className
      )}
      {...props}
    />
  )
}

export {
  Sidebar,
  shadow-1jmom1evr54n,
  shadow-mrlmdmlum6cp,
  shadow-c2c6nex6rbd3,
  shadow-2xe3fdme9539,
  shadow-qik2c1sysr2v,
  shadow-hte38brwh2l6,
  shadow-5r6kl0v17yeh,
  shadow-d8rji0zy03ke,
  shadow-bbbdgqc3pxf4,
  shadow-8sqtnvzw1808,
  shadow-1gzhqis4ayhj,
  shadow-itqyilbbosx2,
  shadow-eenmnz65aj3p,
  shadow-wqqqrdmxnmay,
  shadow-dsocaihyglxi,
  shadow-8qk7tz9ocyje,
  shadow-7gdreyc5v5l1,
  shadow-laitv38xmw08,
  shadow-59aopwp6fyd7,
  shadow-kocpaktw4dt6,
  shadow-gsz7ulf4dvyj,
  shadow-2wd772ta8a3k,
  useSidebar,
}
