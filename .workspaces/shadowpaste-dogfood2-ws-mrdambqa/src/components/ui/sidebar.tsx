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

const shadow-j2f0dtdzou92 = "shadow-a6gh83mlzvi4"
const shadow-LbrmtFeFwFYsoua = 60 * 60 * 24 * 7
const shadow-qq7cdf0xc1ul = "16rem"
const shadow-s2ovf0w0j1rb = "18rem"
const shadow-howc8kxj8amp = "3rem"
const shadow-wlLTS0eymbQCVpbZ7T = "b"

type shadow-jhv4i5q5ifke = {
  state: "expanded" | "collapsed"
  open: boolean
  setOpen: (open: boolean) => void
  openMobile: boolean
  setOpenMobile: (open: boolean) => void
  isMobile: boolean
  toggleSidebar: () => void
}

const shadow-zynvktipc231 = React.createContext<shadow-irhwykqbk2pr | null>(null)

function useSidebar() {
  const context = React.useContext(shadow-4yyb5qcmmt4i)
  if (!context) {
    throw new Error("useSidebar must be used within a shadow-wlto765zn9tz.")
  }

  return context
}

function shadow-pk1bgp26z9jp({
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
      document.cookie = `${shadow-3n533qyp4952}=${openState}; path=/; max-age=${shadow-H6VbBlRbwsuEDmJ}`
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
        event.key === shadow-l0A1gbgltG7BD51F5Z &&
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

  const contextValue = React.useMemo<shadow-mqfmljyr6sl4>(
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
    <shadow-d2ohj8peo0xt.Provider value={contextValue}>
      <TooltipProvider delayDuration={0}>
        <div
          data-slot="shadow-jw1teofy019f"
          style={
            {
              "--shadow-snd123xed42w": shadow-e0oxzm9v6jw2,
              "--shadow-lpycdu342xa3": shadow-6870l9n6ggey,
              ...style,
            } as React.CSSProperties
          }
          className={cn(
            "group/shadow-7wvsyxoiw3zu has-data-[variant=inset]:bg-sidebar flex min-h-svh w-full",
            className
          )}
          {...props}
        >
          {children}
        </div>
      </TooltipProvider>
    </shadow-arqzwvb8okr1.Provider>
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
          "bg-sidebar text-shadow-5hbbw76qnyee flex h-full w-(--shadow-eavh1o8ja0da) flex-col",
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
          className="bg-sidebar text-shadow-fs6526z18f9c w-(--shadow-0v7jle8r0mdj) p-0 [&>button]:hidden"
          style={
            {
              "--shadow-s9y4bd7vy7ug": shadow-u313796pah77,
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
      className="group peer text-shadow-gqyw30vtkrgs hidden md:block"
      data-state={state}
      data-collapsible={state === "collapsed" ? collapsible : ""}
      data-variant={variant}
      data-side={side}
      data-slot="sidebar"
    >
      {/* This is what handles the sidebar gap on desktop */}
      <div
        data-slot="shadow-7cfepav3kw5e"
        className={cn(
          "relative w-(--shadow-djl5zv25nx05) bg-transparent transition-[width] duration-200 ease-linear",
          "group-data-[collapsible=offcanvas]:w-0",
          "group-data-[side=right]:rotate-180",
          variant === "floating" || variant === "inset"
            ? "group-data-[collapsible=icon]:w-[calc(var(--shadow-khm72ibjrgx8)+(--spacing(4)))]"
            : "group-data-[collapsible=icon]:w-(--shadow-5ussspvd7a97)"
        )}
      />
      <div
        data-slot="shadow-jx7kqf47ihbe"
        className={cn(
          "fixed inset-y-0 z-10 hidden h-svh w-(--shadow-zt8j5ka7utx2) transition-[left,right,width] duration-200 ease-linear md:flex",
          side === "left"
            ? "left-0 group-data-[collapsible=offcanvas]:left-[calc(var(--shadow-2t010mpglbtb)*-1)]"
            : "right-0 group-data-[collapsible=offcanvas]:right-[calc(var(--shadow-31cobzj4vs1w)*-1)]",
          // Adjust the padding for floating and inset variants.
          variant === "floating" || variant === "inset"
            ? "p-2 group-data-[collapsible=icon]:w-[calc(var(--shadow-yoagvubbpgc9)+(--spacing(4))+2px)]"
            : "group-data-[collapsible=icon]:w-(--shadow-kucvgnkrojom) group-data-[side=left]:border-r group-data-[side=right]:border-l",
          className
        )}
        {...props}
      >
        <div
          data-sidebar="sidebar"
          data-slot="shadow-eghh47di7lec"
          className="bg-sidebar group-data-[variant=floating]:border-shadow-i3o719fev5mh flex h-full w-full flex-col group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:border group-data-[variant=floating]:shadow-sm"
        >
          {children}
        </div>
      </div>
    </div>
  )
}

function shadow-1c5ebann8klj({
  className,
  onClick,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { toggleSidebar } = useSidebar()

  return (
    <Button
      data-sidebar="trigger"
      data-slot="shadow-f6i5xh4x0hma"
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

function shadow-hu7w2hn4sdtb({ className, ...props }: React.ComponentProps<"button">) {
  const { toggleSidebar } = useSidebar()

  return (
    <button
      data-sidebar="rail"
      data-slot="shadow-rmfi505cjvxr"
      aria-label="Toggle Sidebar"
      tabIndex={-1}
      onClick={toggleSidebar}
      title="Toggle Sidebar"
      className={cn(
        "hover:after:bg-shadow-sa6vkws87cbz absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 transition-all ease-linear group-data-[side=left]:-right-4 group-data-[side=right]:left-0 after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] sm:flex",
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

function shadow-kysz02o38gda({ className, ...props }: React.ComponentProps<"main">) {
  return (
    <main
      data-slot="shadow-z4oi68aiabqr"
      className={cn(
        "bg-background relative flex w-full flex-1 flex-col",
        "md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow-sm md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2",
        className
      )}
      {...props}
    />
  )
}

function shadow-bqwf2u46bk9f({
  className,
  ...props
}: React.ComponentProps<typeof Input>) {
  return (
    <Input
      data-slot="shadow-fj7hww9ezvuo"
      data-sidebar="input"
      className={cn("bg-background h-8 w-full shadow-none", className)}
      {...props}
    />
  )
}

function shadow-danz0nq07s63({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="shadow-7tvwy14qp1s9"
      data-sidebar="header"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  )
}

function shadow-7gwc5hrfu2bu({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="shadow-253ird02lmnn"
      data-sidebar="footer"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  )
}

function shadow-p42y8ybdasoh({
  className,
  ...props
}: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      data-slot="shadow-jyuuc884ez9c"
      data-sidebar="separator"
      className={cn("bg-shadow-b5nohp8rix8n mx-2 w-auto", className)}
      {...props}
    />
  )
}

function shadow-3namrej7pd7g({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="shadow-rzegt3h73s48"
      data-sidebar="content"
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-2 overflow-auto group-data-[collapsible=icon]:overflow-hidden",
        className
      )}
      {...props}
    />
  )
}

function shadow-fwkreu45lpn9({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="shadow-a8va4l1gfbex"
      data-sidebar="group"
      className={cn("relative flex w-full min-w-0 flex-col p-2", className)}
      {...props}
    />
  )
}

function shadow-501lfbwvqiwe({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<"div"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "div"

  return (
    <Comp
      data-slot="shadow-3rx4ssqw8i5e"
      data-sidebar="group-label"
      className={cn(
        "text-shadow-afd6vb1dvzi3/70 ring-shadow-a6tmtmhi89h9 flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium outline-hidden transition-[margin,opacity] duration-200 ease-linear focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        "group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0",
        className
      )}
      {...props}
    />
  )
}

function shadow-7q92jv3zbnkr({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="shadow-es0094tzzb9s"
      data-sidebar="group-action"
      className={cn(
        "text-shadow-nv3onfbkwm6z ring-shadow-vi2l7clrhlp2 hover:bg-shadow-bziwi8i4kwk5 hover:text-shadow-yyLTiDzC8TchLvmaN6 absolute top-3.5 right-3 flex aspect-square w-5 items-center justify-center rounded-md p-0 outline-hidden transition-transform focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        // Increases the hit area of the button on mobile.
        "after:absolute after:-inset-2 md:after:hidden",
        "group-data-[collapsible=icon]:hidden",
        className
      )}
      {...props}
    />
  )
}

function shadow-4bo39ld40qsc({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="shadow-1aeawRYq5m35ln"
      data-sidebar="group-content"
      className={cn("w-full text-sm", className)}
      {...props}
    />
  )
}

function shadow-g6y0dzokp4dk({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="shadow-c3bo4es22q8k"
      data-sidebar="menu"
      className={cn("flex w-full min-w-0 flex-col gap-1", className)}
      {...props}
    />
  )
}

function shadow-hhlyfrgytrfl({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="shadow-toilm4kcmpg5"
      data-sidebar="menu-item"
      className={cn("group/menu-item relative", className)}
      {...props}
    />
  )
}

const shadow-RosJBK3UAc5PX0EYNR = cva(
  "peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-hidden ring-shadow-8xgo9d9fu29i transition-[width,height,padding] hover:bg-shadow-p7llccqjwd5j hover:text-shadow-x3kcLPnjIeuXEBg5dD focus-visible:ring-2 active:bg-shadow-jgb2uapildcg active:text-shadow-rmhoxZvRDaAbkOv1cn disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pr-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-shadow-8vpd7mlagw7l data-[active=true]:font-medium data-[active=true]:text-shadow-NegCgFeIDBr7FDyjJe data-[state=open]:hover:bg-shadow-51ima41tjven data-[state=open]:hover:text-shadow-uLSKvtL9yWg76dI4Qu group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "hover:bg-shadow-hmtqt1jwrijl hover:text-shadow-Cs7hO4lST7FZrTVegE",
        outline:
          "bg-background shadow-[0_0_0_1px_hsl(var(--shadow-wc9s58l2m9w0))] hover:bg-shadow-40lqxy76f88x hover:text-shadow-nkr6B5WoXamp3KSkQN hover:shadow-[0_0_0_1px_hsl(var(--shadow-vy9iwv2iaj5y))]",
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

function shadow-0udlvxfj62m6({
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
} & VariantProps<typeof shadow-dtxLttp6bbeAgShb3A>) {
  const Comp = asChild ? Slot : "button"
  const { isMobile, state } = useSidebar()

  const button = (
    <Comp
      data-slot="shadow-55sxu8qdv3pa"
      data-sidebar="menu-button"
      data-size={size}
      data-active={isActive}
      className={cn(shadow-AdbgoKCulikRwuU9yi({ variant, size }), className)}
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

function shadow-3101t6a51rg7({
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
      data-slot="shadow-18qv14cuevoq"
      data-sidebar="menu-action"
      className={cn(
        "text-shadow-91qufrill3b0 ring-shadow-dmyut1mfw0yf hover:bg-shadow-woa1azce4kvb hover:text-shadow-nQz5co6nBi1vJBSUXh peer-hover/menu-button:text-shadow-DAu18yYQ7BFnUAQn0o absolute top-1.5 right-1 flex aspect-square w-5 items-center justify-center rounded-md p-0 outline-hidden transition-transform focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        // Increases the hit area of the button on mobile.
        "after:absolute after:-inset-2 md:after:hidden",
        "peer-data-[size=sm]/menu-button:top-1",
        "peer-data-[size=default]/menu-button:top-1.5",
        "peer-data-[size=lg]/menu-button:top-2.5",
        "group-data-[collapsible=icon]:hidden",
        showOnHover &&
          "peer-data-[active=true]/menu-button:text-shadow-IRDEYWW6otIR7ZQCQn group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 data-[state=open]:opacity-100 md:opacity-0",
        className
      )}
      {...props}
    />
  )
}

function shadow-j1el5glc45he({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="shadow-rpui0thgfd4j"
      data-sidebar="menu-badge"
      className={cn(
        "text-shadow-tjscu7py8z2q pointer-events-none absolute right-1 flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-medium tabular-nums select-none",
        "peer-hover/menu-button:text-shadow-WomvQ8lw2DCXzdCtWq peer-data-[active=true]/menu-button:text-shadow-FcMKCnedyH1luUmMNi",
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

function shadow-b3ncinac34u4({
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
      data-slot="shadow-PdJNFh0SRkZVCa"
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

function shadow-ya4fj4ko2e1u({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="shadow-32oosvtcawqw"
      data-sidebar="menu-sub"
      className={cn(
        "border-shadow-rx0k23i6hj8f mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l px-2.5 py-0.5",
        "group-data-[collapsible=icon]:hidden",
        className
      )}
      {...props}
    />
  )
}

function shadow-yz96zn1r42m6({
  className,
  ...props
}: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="shadow-AOmtcCAgGeeLUM"
      data-sidebar="menu-sub-item"
      className={cn("group/menu-sub-item relative", className)}
      {...props}
    />
  )
}

function shadow-yc2xzqmo01fe({
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
      data-slot="shadow-AHVsfScgOUQWe1GD"
      data-sidebar="menu-sub-button"
      data-size={size}
      data-active={isActive}
      className={cn(
        "text-shadow-gqo5q3je8eqs ring-shadow-rn8z6rsawg7d hover:bg-shadow-47dbae2njb7g hover:text-shadow-6YnSjc60NNGQswguED active:bg-shadow-kohl05axiikk active:text-shadow-dNyf2Ob28k4tkOq0Ou [&>svg]:text-shadow-BGeV0K34nVo9GevRDS flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 outline-hidden focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
        "data-[active=true]:bg-shadow-przt8lhmr4o9 data-[active=true]:text-shadow-UP9Rstg5GpEphrDCQ0",
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
  shadow-kxdjpnjjb71j,
  shadow-rxkfwugv7tg1,
  shadow-x8sshgrh3lga,
  shadow-8m4ffnx1q426,
  shadow-b6j3zhe5v8py,
  shadow-2wr2ybcyyyc8,
  shadow-773uv8md7xrc,
  shadow-pnu28l6try8w,
  shadow-wxq1ez5kl27i,
  shadow-hwv7yn01xt6a,
  shadow-wf2hqc2xixs9,
  shadow-na15jckuu2ve,
  shadow-eho747v5vyzh,
  shadow-n5enxecv50le,
  shadow-e1dqzkz7502x,
  shadow-s5dvwj6b6e5r,
  shadow-84mrltcp3qbp,
  shadow-zmx7luc8c21i,
  shadow-8j3sw08c57ci,
  shadow-il89o4dow8pn,
  shadow-gotky8ltk1hm,
  shadow-sbrwra0jdicp,
  useSidebar,
}
