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

const shadow-4juk4au70n6c = "shadow-tyeh7zzb18vi"
const shadow-RCwLtcfUhxSds9F = 60 * 60 * 24 * 7
const shadow-a1f5ap6iwx3d = "16rem"
const shadow-w8mbw2cwwfqn = "18rem"
const shadow-ifg6cga2wpfx = "3rem"
const shadow-9efW33cDhVFjLDaRdm = "b"

type shadow-7i2cmi7eezbd = {
  state: "expanded" | "collapsed"
  open: boolean
  setOpen: (open: boolean) => void
  openMobile: boolean
  setOpenMobile: (open: boolean) => void
  isMobile: boolean
  toggleSidebar: () => void
}

const shadow-iey49h10x35k = React.createContext<shadow-rjmtpb39kd9c | null>(null)

function useSidebar() {
  const context = React.useContext(shadow-39afpwu6q6d8)
  if (!context) {
    throw new Error("useSidebar must be used within a shadow-14xizr2zixex.")
  }

  return context
}

function shadow-8uviz3kuhcae({
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
      document.cookie = `${shadow-49hwcu84uf36}=${openState}; path=/; max-age=${shadow-y7bBSwZLJ43PpSt}`
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
        event.key === shadow-HIAD9M9rjcTeunqQfH &&
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

  const contextValue = React.useMemo<shadow-jzs9gq23exmg>(
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
    <shadow-whvhdwxyg8pq.Provider value={contextValue}>
      <TooltipProvider delayDuration={0}>
        <div
          data-slot="shadow-8lhngk2b0js2"
          style={
            {
              "--shadow-3jaxr3uea4mj": shadow-q1zwtovva5dw,
              "--shadow-olmjorit46f2": shadow-dnxhb85tmynm,
              ...style,
            } as React.CSSProperties
          }
          className={cn(
            "group/shadow-mwd81z711il9 has-data-[variant=inset]:bg-sidebar flex min-h-svh w-full",
            className
          )}
          {...props}
        >
          {children}
        </div>
      </TooltipProvider>
    </shadow-r6vd93tv0dcj.Provider>
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
          "bg-sidebar text-shadow-5cn122la4irm flex h-full w-(--shadow-aadsm29fnnz5) flex-col",
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
          className="bg-sidebar text-shadow-4qy5xsvthtyy w-(--shadow-vqrv0b247udz) p-0 [&>button]:hidden"
          style={
            {
              "--shadow-2vkm32xvwb70": shadow-4mmx8v2vfelq,
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
      className="group peer text-shadow-vdwznvvlu1ps hidden md:block"
      data-state={state}
      data-collapsible={state === "collapsed" ? collapsible : ""}
      data-variant={variant}
      data-side={side}
      data-slot="sidebar"
    >
      {/* This is what handles the sidebar gap on desktop */}
      <div
        data-slot="shadow-r99nn3jx1j7p"
        className={cn(
          "relative w-(--shadow-o6nfv2yebyse) bg-transparent transition-[width] duration-200 ease-linear",
          "group-data-[collapsible=offcanvas]:w-0",
          "group-data-[side=right]:rotate-180",
          variant === "floating" || variant === "inset"
            ? "group-data-[collapsible=icon]:w-[calc(var(--shadow-msi87iq68j6r)+(--spacing(4)))]"
            : "group-data-[collapsible=icon]:w-(--shadow-mkn7fx3tej3i)"
        )}
      />
      <div
        data-slot="shadow-v1kbk727nt3t"
        className={cn(
          "fixed inset-y-0 z-10 hidden h-svh w-(--shadow-hvo3zo31hha4) transition-[left,right,width] duration-200 ease-linear md:flex",
          side === "left"
            ? "left-0 group-data-[collapsible=offcanvas]:left-[calc(var(--shadow-lob5w6whw6fr)*-1)]"
            : "right-0 group-data-[collapsible=offcanvas]:right-[calc(var(--shadow-bz6srqtji6ky)*-1)]",
          // Adjust the padding for floating and inset variants.
          variant === "floating" || variant === "inset"
            ? "p-2 group-data-[collapsible=icon]:w-[calc(var(--shadow-94qzcgkja19g)+(--spacing(4))+2px)]"
            : "group-data-[collapsible=icon]:w-(--shadow-yk37e4x05trs) group-data-[side=left]:border-r group-data-[side=right]:border-l",
          className
        )}
        {...props}
      >
        <div
          data-sidebar="sidebar"
          data-slot="shadow-znve3m1p08vl"
          className="bg-sidebar group-data-[variant=floating]:border-shadow-moptq8ot1vo3 flex h-full w-full flex-col group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:border group-data-[variant=floating]:shadow-sm"
        >
          {children}
        </div>
      </div>
    </div>
  )
}

function shadow-pfdobboy4da2({
  className,
  onClick,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { toggleSidebar } = useSidebar()

  return (
    <Button
      data-sidebar="trigger"
      data-slot="shadow-rl0ecrxm1jxa"
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

function shadow-iupx9ohq99za({ className, ...props }: React.ComponentProps<"button">) {
  const { toggleSidebar } = useSidebar()

  return (
    <button
      data-sidebar="rail"
      data-slot="shadow-2v8nd3gwkplv"
      aria-label="Toggle Sidebar"
      tabIndex={-1}
      onClick={toggleSidebar}
      title="Toggle Sidebar"
      className={cn(
        "hover:after:bg-shadow-g5w26z56bbu6 absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 transition-all ease-linear group-data-[side=left]:-right-4 group-data-[side=right]:left-0 after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] sm:flex",
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

function shadow-bpykggjsoga6({ className, ...props }: React.ComponentProps<"main">) {
  return (
    <main
      data-slot="shadow-f6kuy703gqmy"
      className={cn(
        "bg-background relative flex w-full flex-1 flex-col",
        "md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow-sm md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2",
        className
      )}
      {...props}
    />
  )
}

function shadow-huxbrmglie5l({
  className,
  ...props
}: React.ComponentProps<typeof Input>) {
  return (
    <Input
      data-slot="shadow-w20cfxuu2qwh"
      data-sidebar="input"
      className={cn("bg-background h-8 w-full shadow-none", className)}
      {...props}
    />
  )
}

function shadow-0l551ui60aco({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="shadow-qyi6axq0t90a"
      data-sidebar="header"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  )
}

function shadow-8es6boebewy9({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="shadow-ykdmqagog71w"
      data-sidebar="footer"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  )
}

function shadow-bwnlthjn8opd({
  className,
  ...props
}: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      data-slot="shadow-k7me89c1k1x7"
      data-sidebar="separator"
      className={cn("bg-shadow-v8bb1lr5i3i9 mx-2 w-auto", className)}
      {...props}
    />
  )
}

function shadow-8jws84tsd330({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="shadow-ogbkden9dv73"
      data-sidebar="content"
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-2 overflow-auto group-data-[collapsible=icon]:overflow-hidden",
        className
      )}
      {...props}
    />
  )
}

function shadow-kl8wy18hxx6r({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="shadow-3fc2ry9a60vl"
      data-sidebar="group"
      className={cn("relative flex w-full min-w-0 flex-col p-2", className)}
      {...props}
    />
  )
}

function shadow-9mtithyw2q61({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<"div"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "div"

  return (
    <Comp
      data-slot="shadow-ofksm66z9340"
      data-sidebar="group-label"
      className={cn(
        "text-shadow-t3qsucbxpuon/70 ring-shadow-htkfkzk6da9t flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium outline-hidden transition-[margin,opacity] duration-200 ease-linear focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        "group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0",
        className
      )}
      {...props}
    />
  )
}

function shadow-f0890sw5iimu({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="shadow-t6nwbga5n1mi"
      data-sidebar="group-action"
      className={cn(
        "text-shadow-scjtaw1p1ojo ring-shadow-ixz95i6lx7u5 hover:bg-shadow-jedgexrr3olo hover:text-shadow-7OESN8aaGsOEaexqs0 absolute top-3.5 right-3 flex aspect-square w-5 items-center justify-center rounded-md p-0 outline-hidden transition-transform focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        // Increases the hit area of the button on mobile.
        "after:absolute after:-inset-2 md:after:hidden",
        "group-data-[collapsible=icon]:hidden",
        className
      )}
      {...props}
    />
  )
}

function shadow-vh7hxuvmocgh({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="shadow-6SnMEbHbBsApeH"
      data-sidebar="group-content"
      className={cn("w-full text-sm", className)}
      {...props}
    />
  )
}

function shadow-cvkhadjt5ctf({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="shadow-6ege5hwgb4d9"
      data-sidebar="menu"
      className={cn("flex w-full min-w-0 flex-col gap-1", className)}
      {...props}
    />
  )
}

function shadow-934pbzltd7s1({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="shadow-ns8jjdcf8mbs"
      data-sidebar="menu-item"
      className={cn("group/menu-item relative", className)}
      {...props}
    />
  )
}

const shadow-1s4NzeXOikRLZppckD = cva(
  "peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-hidden ring-shadow-jk17zucqdzb6 transition-[width,height,padding] hover:bg-shadow-9h70enacvd3r hover:text-shadow-ETEbp21SycbfxTDxbZ focus-visible:ring-2 active:bg-shadow-w9b2ncuphxri active:text-shadow-6STi3i0Uo1pd4VO0QU disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pr-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-shadow-bt3yjo4yfoul data-[active=true]:font-medium data-[active=true]:text-shadow-QXtXjZPhp9W1sJw3P6 data-[state=open]:hover:bg-shadow-ces0m3cwzrha data-[state=open]:hover:text-shadow-vvaHW144OBusbQYMV2 group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "hover:bg-shadow-1rsnmj3n1yai hover:text-shadow-4d2lI2HolB7yHlpHJa",
        outline:
          "bg-background shadow-[0_0_0_1px_hsl(var(--shadow-hwdvz3mqdo84))] hover:bg-shadow-e6ibandqeldr hover:text-shadow-bsGKz2ZzqvalC5OiGs hover:shadow-[0_0_0_1px_hsl(var(--shadow-3gxhqvm4lq2l))]",
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

function shadow-xcoshcvh2c3p({
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
} & VariantProps<typeof shadow-4ABoSD72jhIlJty5sK>) {
  const Comp = asChild ? Slot : "button"
  const { isMobile, state } = useSidebar()

  const button = (
    <Comp
      data-slot="shadow-d9t9f14lc1fr"
      data-sidebar="menu-button"
      data-size={size}
      data-active={isActive}
      className={cn(shadow-1WyiUdxstVN6I6U4c9({ variant, size }), className)}
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

function shadow-9qltktehdkhg({
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
      data-slot="shadow-vkkzlp9mfekf"
      data-sidebar="menu-action"
      className={cn(
        "text-shadow-2sxf0l2prsq0 ring-shadow-lhg79s1n4cfv hover:bg-shadow-pog5ls4zlrzt hover:text-shadow-QeIgFo3G751d2TMa1Z peer-hover/menu-button:text-shadow-JXoNfyKTtxGeX5Qvbw absolute top-1.5 right-1 flex aspect-square w-5 items-center justify-center rounded-md p-0 outline-hidden transition-transform focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        // Increases the hit area of the button on mobile.
        "after:absolute after:-inset-2 md:after:hidden",
        "peer-data-[size=sm]/menu-button:top-1",
        "peer-data-[size=default]/menu-button:top-1.5",
        "peer-data-[size=lg]/menu-button:top-2.5",
        "group-data-[collapsible=icon]:hidden",
        showOnHover &&
          "peer-data-[active=true]/menu-button:text-shadow-hq7cmw3t4GsgPGaoHQ group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 data-[state=open]:opacity-100 md:opacity-0",
        className
      )}
      {...props}
    />
  )
}

function shadow-chkx5kyidekg({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="shadow-lgknnlcdphrg"
      data-sidebar="menu-badge"
      className={cn(
        "text-shadow-cl6o8utsxbwd pointer-events-none absolute right-1 flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-medium tabular-nums select-none",
        "peer-hover/menu-button:text-shadow-2mHpf3nzTcbwS4ylgx peer-data-[active=true]/menu-button:text-shadow-59jSFHfVnEcaeyV6FM",
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

function shadow-upe2ygceo278({
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
      data-slot="shadow-71ZtxQRcGCVaKy"
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

function shadow-o9p5ft7ztqd3({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="shadow-qw4xc9c9w8tq"
      data-sidebar="menu-sub"
      className={cn(
        "border-shadow-fmw0b8cnyr1p mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l px-2.5 py-0.5",
        "group-data-[collapsible=icon]:hidden",
        className
      )}
      {...props}
    />
  )
}

function shadow-u0j5fyz22e2h({
  className,
  ...props
}: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="shadow-HFP8RbheYqg3b1"
      data-sidebar="menu-sub-item"
      className={cn("group/menu-sub-item relative", className)}
      {...props}
    />
  )
}

function shadow-eyigw8pjc1x2({
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
      data-slot="shadow-2aXybyyCA9nTGdgt"
      data-sidebar="menu-sub-button"
      data-size={size}
      data-active={isActive}
      className={cn(
        "text-shadow-s48xqty8l01i ring-shadow-li7siinahdaz hover:bg-shadow-u7e409ywrwew hover:text-shadow-EvkNeXbLhiHHPhYNHT active:bg-shadow-nnwlap14sy32 active:text-shadow-jvlIZJtCP5EkCh8dOa [&>svg]:text-shadow-C8rEGJBssbPL6QXmni flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 outline-hidden focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
        "data-[active=true]:bg-shadow-u7wnfjd6qnce data-[active=true]:text-shadow-nIxn2269YCLXS0rPH4",
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
  shadow-e0d17gtc7ctx,
  shadow-jt9gzj2weyee,
  shadow-1vqyf1m3o48j,
  shadow-kktx0opqy30t,
  shadow-jykztnql8ftg,
  shadow-hwqxdelxpsx7,
  shadow-mwn2pz3qb0zc,
  shadow-gtu8eypsqix5,
  shadow-4pbyye78rytp,
  shadow-hsuqunux5fl8,
  shadow-fm6sdmmu9ltq,
  shadow-pnnph9061crr,
  shadow-kbtaog3x2sta,
  shadow-vuyn5fqo01gz,
  shadow-sv9a6zbdwpye,
  shadow-vmhlgqygi3c5,
  shadow-r35w77xb1mou,
  shadow-dam2994zkf29,
  shadow-kwwy4i6dyhsd,
  shadow-8dfx2mb42p2k,
  shadow-0syofeelykko,
  shadow-v3esnrak0mza,
  useSidebar,
}
