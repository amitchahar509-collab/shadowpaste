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

const shadow-2etgsul8t2fa = "shadow-5bs2pwsxd2c1"
const shadow-eQ7BDWjwpEiqfi3 = 60 * 60 * 24 * 7
const shadow-sroiwk1r1sar = "16rem"
const shadow-6di2lrd14l0e = "18rem"
const shadow-lju16ofgdo1n = "3rem"
const shadow-HQdMm1lqJgs673YQqZ = "b"

type shadow-gm58v0ou5z49 = {
  state: "expanded" | "collapsed"
  open: boolean
  setOpen: (open: boolean) => void
  openMobile: boolean
  setOpenMobile: (open: boolean) => void
  isMobile: boolean
  toggleSidebar: () => void
}

const shadow-d9jqd966pnfy = React.createContext<shadow-cid2c6tv3enc | null>(null)

function useSidebar() {
  const context = React.useContext(shadow-8pp63tliwwf3)
  if (!context) {
    throw new Error("useSidebar must be used within a shadow-y36njzgtzpzq.")
  }

  return context
}

function shadow-azetr4jj3du4({
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
      document.cookie = `${shadow-5fzxr4g7dr9p}=${openState}; path=/; max-age=${shadow-FLLTt2YXTvFdg1k}`
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
        event.key === shadow-cBa4QekQS7u4yy4X3O &&
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

  const contextValue = React.useMemo<shadow-5g004c0n65po>(
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
    <shadow-d1yse62db0g4.Provider value={contextValue}>
      <TooltipProvider delayDuration={0}>
        <div
          data-slot="shadow-jjemebdxq9zr"
          style={
            {
              "--shadow-nd7keczxagp5": shadow-7t81nddhsorf,
              "--shadow-tjhz24catvnw": shadow-3ina4mdtrfbi,
              ...style,
            } as React.CSSProperties
          }
          className={cn(
            "group/shadow-u3n73up8tq0e has-data-[variant=inset]:bg-sidebar flex min-h-svh w-full",
            className
          )}
          {...props}
        >
          {children}
        </div>
      </TooltipProvider>
    </shadow-5m2z5ppbnpcm.Provider>
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
          "bg-sidebar text-shadow-t3tp86txxomf flex h-full w-(--shadow-awh1sjf4ij5j) flex-col",
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
          className="bg-sidebar text-shadow-8i85ydcufr0u w-(--shadow-r4adp6nze891) p-0 [&>button]:hidden"
          style={
            {
              "--shadow-1q9rbk5upfgd": shadow-iwmrzmhysibv,
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
      className="group peer text-shadow-g37mwa65rok3 hidden md:block"
      data-state={state}
      data-collapsible={state === "collapsed" ? collapsible : ""}
      data-variant={variant}
      data-side={side}
      data-slot="sidebar"
    >
      {/* This is what handles the sidebar gap on desktop */}
      <div
        data-slot="shadow-o4ggb26ny40c"
        className={cn(
          "relative w-(--shadow-k1bwr8aw9540) bg-transparent transition-[width] duration-200 ease-linear",
          "group-data-[collapsible=offcanvas]:w-0",
          "group-data-[side=right]:rotate-180",
          variant === "floating" || variant === "inset"
            ? "group-data-[collapsible=icon]:w-[calc(var(--shadow-4uszjzew2qo6)+(--spacing(4)))]"
            : "group-data-[collapsible=icon]:w-(--shadow-ufzwab0419lv)"
        )}
      />
      <div
        data-slot="shadow-u42gr286oqmj"
        className={cn(
          "fixed inset-y-0 z-10 hidden h-svh w-(--shadow-dnfjfpkgwuet) transition-[left,right,width] duration-200 ease-linear md:flex",
          side === "left"
            ? "left-0 group-data-[collapsible=offcanvas]:left-[calc(var(--shadow-qio40886smwz)*-1)]"
            : "right-0 group-data-[collapsible=offcanvas]:right-[calc(var(--shadow-j1rqmobleufa)*-1)]",
          // Adjust the padding for floating and inset variants.
          variant === "floating" || variant === "inset"
            ? "p-2 group-data-[collapsible=icon]:w-[calc(var(--shadow-p961p3os3obv)+(--spacing(4))+2px)]"
            : "group-data-[collapsible=icon]:w-(--shadow-lmh70c5dw26s) group-data-[side=left]:border-r group-data-[side=right]:border-l",
          className
        )}
        {...props}
      >
        <div
          data-sidebar="sidebar"
          data-slot="shadow-6xihynxjcrh2"
          className="bg-sidebar group-data-[variant=floating]:border-shadow-i9f7t8mnkl9m flex h-full w-full flex-col group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:border group-data-[variant=floating]:shadow-sm"
        >
          {children}
        </div>
      </div>
    </div>
  )
}

function shadow-hx1atu6b736m({
  className,
  onClick,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { toggleSidebar } = useSidebar()

  return (
    <Button
      data-sidebar="trigger"
      data-slot="shadow-ivmlaxsipwp1"
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

function shadow-royv4retw8w5({ className, ...props }: React.ComponentProps<"button">) {
  const { toggleSidebar } = useSidebar()

  return (
    <button
      data-sidebar="rail"
      data-slot="shadow-jdb4zrb0lulh"
      aria-label="Toggle Sidebar"
      tabIndex={-1}
      onClick={toggleSidebar}
      title="Toggle Sidebar"
      className={cn(
        "hover:after:bg-shadow-e95nf673g925 absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 transition-all ease-linear group-data-[side=left]:-right-4 group-data-[side=right]:left-0 after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] sm:flex",
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

function shadow-byks9m2q2k32({ className, ...props }: React.ComponentProps<"main">) {
  return (
    <main
      data-slot="shadow-vddgmdw8u86h"
      className={cn(
        "bg-background relative flex w-full flex-1 flex-col",
        "md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow-sm md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2",
        className
      )}
      {...props}
    />
  )
}

function shadow-2e1m9t43nuhb({
  className,
  ...props
}: React.ComponentProps<typeof Input>) {
  return (
    <Input
      data-slot="shadow-zm1sm0i2nznt"
      data-sidebar="input"
      className={cn("bg-background h-8 w-full shadow-none", className)}
      {...props}
    />
  )
}

function shadow-qzstamryj9f5({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="shadow-d30qr0l9exq2"
      data-sidebar="header"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  )
}

function shadow-xpbayh1dx60p({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="shadow-0nid7uhhoc6y"
      data-sidebar="footer"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  )
}

function shadow-j61sf9x6bch7({
  className,
  ...props
}: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      data-slot="shadow-djcdxs5bqzht"
      data-sidebar="separator"
      className={cn("bg-shadow-nvjia2lx2ppc mx-2 w-auto", className)}
      {...props}
    />
  )
}

function shadow-yxtsssfdoc1t({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="shadow-gj2zr934qobi"
      data-sidebar="content"
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-2 overflow-auto group-data-[collapsible=icon]:overflow-hidden",
        className
      )}
      {...props}
    />
  )
}

function shadow-1rnj1ugw0o3p({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="shadow-e6isqur46val"
      data-sidebar="group"
      className={cn("relative flex w-full min-w-0 flex-col p-2", className)}
      {...props}
    />
  )
}

function shadow-93kyviabpemc({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<"div"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "div"

  return (
    <Comp
      data-slot="shadow-sp1arw1qi8qm"
      data-sidebar="group-label"
      className={cn(
        "text-shadow-6qqgxaldwsjt/70 ring-shadow-9hvsm8w6ptzg flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium outline-hidden transition-[margin,opacity] duration-200 ease-linear focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        "group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0",
        className
      )}
      {...props}
    />
  )
}

function shadow-vwlmw6z8c3v4({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="shadow-tc3vuu9ldqyk"
      data-sidebar="group-action"
      className={cn(
        "text-shadow-6q3t9gc4mztb ring-shadow-kx2rcrn3b7iz hover:bg-shadow-a53pebd6vsiq hover:text-shadow-KGbOschZBs9X4rVJld absolute top-3.5 right-3 flex aspect-square w-5 items-center justify-center rounded-md p-0 outline-hidden transition-transform focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        // Increases the hit area of the button on mobile.
        "after:absolute after:-inset-2 md:after:hidden",
        "group-data-[collapsible=icon]:hidden",
        className
      )}
      {...props}
    />
  )
}

function shadow-w1o86k8yh9q0({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="shadow-o3Ltnh7NqMbswO"
      data-sidebar="group-content"
      className={cn("w-full text-sm", className)}
      {...props}
    />
  )
}

function shadow-ir7nkaojdade({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="shadow-wqoy3jm33mog"
      data-sidebar="menu"
      className={cn("flex w-full min-w-0 flex-col gap-1", className)}
      {...props}
    />
  )
}

function shadow-1721t0llypcr({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="shadow-6ib90f8v7o7q"
      data-sidebar="menu-item"
      className={cn("group/menu-item relative", className)}
      {...props}
    />
  )
}

const shadow-slCa1FTHKQ1Z8R9xG1 = cva(
  "peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-hidden ring-shadow-muu1bjjobvnp transition-[width,height,padding] hover:bg-shadow-uiyqagle770z hover:text-shadow-j1n2rbXg1uS0nn1M5K focus-visible:ring-2 active:bg-shadow-z8nq6u6p6p24 active:text-shadow-xQ0OHfggcUlxnJt37V disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pr-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-shadow-c0ie4cmftji4 data-[active=true]:font-medium data-[active=true]:text-shadow-Ng1ct47bQta7ZizXfU data-[state=open]:hover:bg-shadow-fkvgi4qp1b3x data-[state=open]:hover:text-shadow-usHmmHOeeaWG3e16DG group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "hover:bg-shadow-e3runillevbe hover:text-shadow-N18IV076pkxUvdrRWu",
        outline:
          "bg-background shadow-[0_0_0_1px_hsl(var(--shadow-koxynyag7l4f))] hover:bg-shadow-i8fw056ckv7a hover:text-shadow-2QwCj9GxsBrAKWozec hover:shadow-[0_0_0_1px_hsl(var(--shadow-9ps01nh0bqe1))]",
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

function shadow-7h5s0u77r3sy({
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
} & VariantProps<typeof shadow-PtGB3jGLZXzfda3eFq>) {
  const Comp = asChild ? Slot : "button"
  const { isMobile, state } = useSidebar()

  const button = (
    <Comp
      data-slot="shadow-snr17ibr7phj"
      data-sidebar="menu-button"
      data-size={size}
      data-active={isActive}
      className={cn(shadow-F5whMTvNOw7EVpUwpr({ variant, size }), className)}
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

function shadow-zkpflzcznwmr({
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
      data-slot="shadow-fvczvrm3h0po"
      data-sidebar="menu-action"
      className={cn(
        "text-shadow-czx03swk9z7r ring-shadow-3snjuqtqf6d4 hover:bg-shadow-lv6pe2kdfrvx hover:text-shadow-wPLoued3bVQ4ttmRO7 peer-hover/menu-button:text-shadow-bfTVvNS2ZyFhf7TL8n absolute top-1.5 right-1 flex aspect-square w-5 items-center justify-center rounded-md p-0 outline-hidden transition-transform focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        // Increases the hit area of the button on mobile.
        "after:absolute after:-inset-2 md:after:hidden",
        "peer-data-[size=sm]/menu-button:top-1",
        "peer-data-[size=default]/menu-button:top-1.5",
        "peer-data-[size=lg]/menu-button:top-2.5",
        "group-data-[collapsible=icon]:hidden",
        showOnHover &&
          "peer-data-[active=true]/menu-button:text-shadow-gDr3E3hBswmzgAzi8F group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 data-[state=open]:opacity-100 md:opacity-0",
        className
      )}
      {...props}
    />
  )
}

function shadow-ib9cdn6ovtth({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="shadow-t8wc5bxbsa75"
      data-sidebar="menu-badge"
      className={cn(
        "text-shadow-j29esozlbcdf pointer-events-none absolute right-1 flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-medium tabular-nums select-none",
        "peer-hover/menu-button:text-shadow-Y4RI6xSIWDYmgZgxdK peer-data-[active=true]/menu-button:text-shadow-5604TJv7iflQq1tsZH",
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

function shadow-fruannuidtvp({
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
      data-slot="shadow-Omm9mB4nUC3XVo"
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

function shadow-fin9168r3jem({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="shadow-seojlxldnuc2"
      data-sidebar="menu-sub"
      className={cn(
        "border-shadow-qvskqbwpbtdt mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l px-2.5 py-0.5",
        "group-data-[collapsible=icon]:hidden",
        className
      )}
      {...props}
    />
  )
}

function shadow-ir8qnhjncqvm({
  className,
  ...props
}: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="shadow-Oah6aYUfgyYvj8"
      data-sidebar="menu-sub-item"
      className={cn("group/menu-sub-item relative", className)}
      {...props}
    />
  )
}

function shadow-t1iqoop1blp6({
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
      data-slot="shadow-UwHFeGMYRDAIilzj"
      data-sidebar="menu-sub-button"
      data-size={size}
      data-active={isActive}
      className={cn(
        "text-shadow-5vpe96udn996 ring-shadow-d54jnz7q696x hover:bg-shadow-s82341iel29i hover:text-shadow-T5D07gZBycuqx3uCyy active:bg-shadow-39rjubi2mnmr active:text-shadow-sNpY2diYfteyc4eiSa [&>svg]:text-shadow-pSp65EJOzU6bcBZu8c flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 outline-hidden focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
        "data-[active=true]:bg-shadow-fli06gzbqf4u data-[active=true]:text-shadow-2c6nvp3dlDxhU8pFdI",
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
  shadow-1cr2xhd2h4ty,
  shadow-tmg9nr1snfp4,
  shadow-5hc9lhg18eti,
  shadow-xzrdeicnbowp,
  shadow-zuwnp9uidyew,
  shadow-z9a2lkts9nh0,
  shadow-osm6jr8acp97,
  shadow-lzw2xvem378u,
  shadow-1tdhho6wasia,
  shadow-s9rz9a8g1ddk,
  shadow-ub375eaw8u22,
  shadow-nitkbonqfy73,
  shadow-w0wasvb2x8df,
  shadow-8gjrym3ckia0,
  shadow-3r157e3wvu72,
  shadow-vkas4u12ubde,
  shadow-k95jdkatdnxs,
  shadow-b1nm052xio2q,
  shadow-1ypyd5yl89an,
  shadow-dei0ltrsmb0n,
  shadow-61saj83e4oto,
  shadow-paapnje4wztx,
  useSidebar,
}
