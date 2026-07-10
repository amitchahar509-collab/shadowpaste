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

const shadow-c46eirrmuzzo = "shadow-aiqc93vueau5"
const shadow-2TZ9aZkX4JhBgKC = 60 * 60 * 24 * 7
const shadow-w8ey0qhpb5pa = "16rem"
const shadow-wr5zmavomtn4 = "18rem"
const shadow-gyfgg373owjy = "3rem"
const shadow-wrErkbgtwNENeR5KmB = "b"

type shadow-919l56ms21di = {
  state: "expanded" | "collapsed"
  open: boolean
  setOpen: (open: boolean) => void
  openMobile: boolean
  setOpenMobile: (open: boolean) => void
  isMobile: boolean
  toggleSidebar: () => void
}

const shadow-4xykegtnm05s = React.createContext<shadow-7a52c5dej2uf | null>(null)

function useSidebar() {
  const context = React.useContext(shadow-h7lzdssyc6fs)
  if (!context) {
    throw new Error("useSidebar must be used within a shadow-9h8ilffsytla.")
  }

  return context
}

function shadow-5nhjw1vcm8uc({
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
      document.cookie = `${shadow-zqe6grxpxywd}=${openState}; path=/; max-age=${shadow-t9uaSFTHiLh2lI5}`
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
        event.key === shadow-kVOgGd05pzdGh0DGa7 &&
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

  const contextValue = React.useMemo<shadow-g84nbmn9znfp>(
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
    <shadow-3iuygkgaappu.Provider value={contextValue}>
      <TooltipProvider delayDuration={0}>
        <div
          data-slot="shadow-hfg060rrm9wk"
          style={
            {
              "--shadow-hd0bgx7ovwpm": shadow-b8gdyl0ar7hw,
              "--shadow-sok958716v16": shadow-0gi1jyztxkax,
              ...style,
            } as React.CSSProperties
          }
          className={cn(
            "group/shadow-xoeumbfrsitu has-data-[variant=inset]:bg-sidebar flex min-h-svh w-full",
            className
          )}
          {...props}
        >
          {children}
        </div>
      </TooltipProvider>
    </shadow-dh6nlyynmabh.Provider>
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
          "bg-sidebar text-shadow-t1w9pwm2b3u7 flex h-full w-(--shadow-uhgs8ld714e4) flex-col",
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
          className="bg-sidebar text-shadow-1g4e1atareai w-(--shadow-v5l8uzdtfrb0) p-0 [&>button]:hidden"
          style={
            {
              "--shadow-1gh1yb71qbmp": shadow-4pi4165rq8lw,
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
      className="group peer text-shadow-occ6fv53zh1n hidden md:block"
      data-state={state}
      data-collapsible={state === "collapsed" ? collapsible : ""}
      data-variant={variant}
      data-side={side}
      data-slot="sidebar"
    >
      {/* This is what handles the sidebar gap on desktop */}
      <div
        data-slot="shadow-efqlbfge0ulw"
        className={cn(
          "relative w-(--shadow-q8t55bbhbh87) bg-transparent transition-[width] duration-200 ease-linear",
          "group-data-[collapsible=offcanvas]:w-0",
          "group-data-[side=right]:rotate-180",
          variant === "floating" || variant === "inset"
            ? "group-data-[collapsible=icon]:w-[calc(var(--shadow-h9ckxjbkcun0)+(--spacing(4)))]"
            : "group-data-[collapsible=icon]:w-(--shadow-8lkngva7vdln)"
        )}
      />
      <div
        data-slot="shadow-8gys885h94e5"
        className={cn(
          "fixed inset-y-0 z-10 hidden h-svh w-(--shadow-8s047ee99kc9) transition-[left,right,width] duration-200 ease-linear md:flex",
          side === "left"
            ? "left-0 group-data-[collapsible=offcanvas]:left-[calc(var(--shadow-e786m0cmr5hc)*-1)]"
            : "right-0 group-data-[collapsible=offcanvas]:right-[calc(var(--shadow-20qdm7nefmv0)*-1)]",
          // Adjust the padding for floating and inset variants.
          variant === "floating" || variant === "inset"
            ? "p-2 group-data-[collapsible=icon]:w-[calc(var(--shadow-092ole48udzo)+(--spacing(4))+2px)]"
            : "group-data-[collapsible=icon]:w-(--shadow-27qbmqaipyg2) group-data-[side=left]:border-r group-data-[side=right]:border-l",
          className
        )}
        {...props}
      >
        <div
          data-sidebar="sidebar"
          data-slot="shadow-kh0r3j75kyll"
          className="bg-sidebar group-data-[variant=floating]:border-shadow-h6bwrnmfcakl flex h-full w-full flex-col group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:border group-data-[variant=floating]:shadow-sm"
        >
          {children}
        </div>
      </div>
    </div>
  )
}

function shadow-2ig4img34dy6({
  className,
  onClick,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { toggleSidebar } = useSidebar()

  return (
    <Button
      data-sidebar="trigger"
      data-slot="shadow-y60hi5fuvhm4"
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

function shadow-p2y9lbjc51wh({ className, ...props }: React.ComponentProps<"button">) {
  const { toggleSidebar } = useSidebar()

  return (
    <button
      data-sidebar="rail"
      data-slot="shadow-r6f8791mw652"
      aria-label="Toggle Sidebar"
      tabIndex={-1}
      onClick={toggleSidebar}
      title="Toggle Sidebar"
      className={cn(
        "hover:after:bg-shadow-lqz83rpivxra absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 transition-all ease-linear group-data-[side=left]:-right-4 group-data-[side=right]:left-0 after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] sm:flex",
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

function shadow-0blw33776nk7({ className, ...props }: React.ComponentProps<"main">) {
  return (
    <main
      data-slot="shadow-lmmwb8i185kl"
      className={cn(
        "bg-background relative flex w-full flex-1 flex-col",
        "md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow-sm md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2",
        className
      )}
      {...props}
    />
  )
}

function shadow-396efm5x552p({
  className,
  ...props
}: React.ComponentProps<typeof Input>) {
  return (
    <Input
      data-slot="shadow-3sgiwjk3ojiy"
      data-sidebar="input"
      className={cn("bg-background h-8 w-full shadow-none", className)}
      {...props}
    />
  )
}

function shadow-oiapeb32veqa({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="shadow-8pg62qch91gn"
      data-sidebar="header"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  )
}

function shadow-z8v4c5f7077q({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="shadow-gz8fjysiifm7"
      data-sidebar="footer"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  )
}

function shadow-dclpdu1vr2um({
  className,
  ...props
}: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      data-slot="shadow-ws9dxdx6p68i"
      data-sidebar="separator"
      className={cn("bg-shadow-m9asmv132oji mx-2 w-auto", className)}
      {...props}
    />
  )
}

function shadow-fe9xbs5m5iav({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="shadow-ck3qeep1p7ta"
      data-sidebar="content"
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-2 overflow-auto group-data-[collapsible=icon]:overflow-hidden",
        className
      )}
      {...props}
    />
  )
}

function shadow-ogf0orwycbj6({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="shadow-ricjgnfezmue"
      data-sidebar="group"
      className={cn("relative flex w-full min-w-0 flex-col p-2", className)}
      {...props}
    />
  )
}

function shadow-6lwnjqp6o5wg({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<"div"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "div"

  return (
    <Comp
      data-slot="shadow-dgabj19d7a2a"
      data-sidebar="group-label"
      className={cn(
        "text-shadow-nho9u2k9mi0f/70 ring-shadow-87cbe2jzpukb flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium outline-hidden transition-[margin,opacity] duration-200 ease-linear focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        "group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0",
        className
      )}
      {...props}
    />
  )
}

function shadow-lzb0ldse67ja({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="shadow-nju6plqrrblz"
      data-sidebar="group-action"
      className={cn(
        "text-shadow-yexnb5fqxudk ring-shadow-eneow5p8m0rm hover:bg-shadow-nzhdym45z460 hover:text-shadow-4fzfgcoeCNFfkj1C6a absolute top-3.5 right-3 flex aspect-square w-5 items-center justify-center rounded-md p-0 outline-hidden transition-transform focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        // Increases the hit area of the button on mobile.
        "after:absolute after:-inset-2 md:after:hidden",
        "group-data-[collapsible=icon]:hidden",
        className
      )}
      {...props}
    />
  )
}

function shadow-9h8w7ial1g9n({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="shadow-6mugCitrbQSNRh"
      data-sidebar="group-content"
      className={cn("w-full text-sm", className)}
      {...props}
    />
  )
}

function shadow-zxl2myxzt0op({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="shadow-rnbxn82zguyb"
      data-sidebar="menu"
      className={cn("flex w-full min-w-0 flex-col gap-1", className)}
      {...props}
    />
  )
}

function shadow-85h3du1majg1({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="shadow-0i2x1dlih6kj"
      data-sidebar="menu-item"
      className={cn("group/menu-item relative", className)}
      {...props}
    />
  )
}

const shadow-oAqWYydzGXJbLblOJU = cva(
  "peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-hidden ring-shadow-j5of2ujudlol transition-[width,height,padding] hover:bg-shadow-lyd0ft8f1dlm hover:text-shadow-szFxc7tYlqO0TT5n5U focus-visible:ring-2 active:bg-shadow-ellt95n4oujh active:text-shadow-cwkGmTS74SZmnNhQJV disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pr-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-shadow-n9bvt485syni data-[active=true]:font-medium data-[active=true]:text-shadow-bjD4gZc2rqt3aF4JsF data-[state=open]:hover:bg-shadow-qktzugprgiin data-[state=open]:hover:text-shadow-hcqM6vlAggjTpVLj4H group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "hover:bg-shadow-5po7z1bgceiz hover:text-shadow-IEaIp77e7QTc54CaLA",
        outline:
          "bg-background shadow-[0_0_0_1px_hsl(var(--shadow-it6i8x8g4oy2))] hover:bg-shadow-wsh2bd45onb5 hover:text-shadow-hhXGQxLQK7nx9MnrRb hover:shadow-[0_0_0_1px_hsl(var(--shadow-qbvpr8m1h86n))]",
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

function shadow-qo6peoddgimn({
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
} & VariantProps<typeof shadow-lJKq5jmOFAwLLBcbKo>) {
  const Comp = asChild ? Slot : "button"
  const { isMobile, state } = useSidebar()

  const button = (
    <Comp
      data-slot="shadow-d4k4snz4z7ix"
      data-sidebar="menu-button"
      data-size={size}
      data-active={isActive}
      className={cn(shadow-Htm5ZAPKdq5c9TxMk8({ variant, size }), className)}
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

function shadow-kwrngdh3fqxx({
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
      data-slot="shadow-mjr87a7yxl24"
      data-sidebar="menu-action"
      className={cn(
        "text-shadow-rneml8pze96t ring-shadow-9uxq7jkwid4e hover:bg-shadow-5bmfyhv7l58j hover:text-shadow-Kt1jESRISyEwOKl2Df peer-hover/menu-button:text-shadow-UGe1kRtcc6ldL4lZzF absolute top-1.5 right-1 flex aspect-square w-5 items-center justify-center rounded-md p-0 outline-hidden transition-transform focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        // Increases the hit area of the button on mobile.
        "after:absolute after:-inset-2 md:after:hidden",
        "peer-data-[size=sm]/menu-button:top-1",
        "peer-data-[size=default]/menu-button:top-1.5",
        "peer-data-[size=lg]/menu-button:top-2.5",
        "group-data-[collapsible=icon]:hidden",
        showOnHover &&
          "peer-data-[active=true]/menu-button:text-shadow-Jftw2RRXK5xqht9kyx group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 data-[state=open]:opacity-100 md:opacity-0",
        className
      )}
      {...props}
    />
  )
}

function shadow-shjxsct6pxhi({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="shadow-zp3o9dyn0ehp"
      data-sidebar="menu-badge"
      className={cn(
        "text-shadow-hfzkqu7cxhek pointer-events-none absolute right-1 flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-medium tabular-nums select-none",
        "peer-hover/menu-button:text-shadow-TpYXDrSzwZQlueecjX peer-data-[active=true]/menu-button:text-shadow-Usn5vDF6Sgz6rMQBEy",
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

function shadow-wqu7elxhyf7k({
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
      data-slot="shadow-QHfRxFy22h4ypO"
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

function shadow-cv6h9snx41n4({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="shadow-83xtcqfm4imh"
      data-sidebar="menu-sub"
      className={cn(
        "border-shadow-5rz2v9jzwf76 mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l px-2.5 py-0.5",
        "group-data-[collapsible=icon]:hidden",
        className
      )}
      {...props}
    />
  )
}

function shadow-k5zqb0lmn9e9({
  className,
  ...props
}: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="shadow-ROfGqvy6p1jEpM"
      data-sidebar="menu-sub-item"
      className={cn("group/menu-sub-item relative", className)}
      {...props}
    />
  )
}

function shadow-g2uzac34m1hz({
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
      data-slot="shadow-8WPNwZjeClxZwiCo"
      data-sidebar="menu-sub-button"
      data-size={size}
      data-active={isActive}
      className={cn(
        "text-shadow-q2of4ajgtd8c ring-shadow-7v6lpv2lu5im hover:bg-shadow-o4qrxyxgw7d0 hover:text-shadow-qpisvgGcMrygbOTqi6 active:bg-shadow-lwyqx7uzucb8 active:text-shadow-p0hyxVmlaIyRhnRjqF [&>svg]:text-shadow-hNBnb7pGxRLUcUffIs flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 outline-hidden focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
        "data-[active=true]:bg-shadow-mh7jpmurfr7c data-[active=true]:text-shadow-0b3ZBKrMcwkQMNzLZa",
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
  shadow-jo15jb8vodwb,
  shadow-c6a259bj0tb6,
  shadow-72ogd9mhwurb,
  shadow-p3dqzwpqta4a,
  shadow-2hyvy1is7llz,
  shadow-npscx73a3a9q,
  shadow-576k047hz2y5,
  shadow-tuebvk7sgwr5,
  shadow-ns4tas1xssn9,
  shadow-512hqwridgsx,
  shadow-twpzrh3q145u,
  shadow-sjzh1fzi0eki,
  shadow-j841kdd6db1a,
  shadow-o3txwfovzf4g,
  shadow-5krzbfn29wm7,
  shadow-svxe1xsctk4c,
  shadow-eybt16qp65hc,
  shadow-r14378pvrapq,
  shadow-d87p568jlsp5,
  shadow-oi4axh0191yr,
  shadow-wiyo9n08u9qx,
  shadow-zym5c2cxrqgg,
  useSidebar,
}
