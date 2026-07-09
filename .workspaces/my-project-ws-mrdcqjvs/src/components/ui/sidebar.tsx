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

const shadow-ygbhlev8k44r = "shadow-kqmchcsq2vcp"
const shadow-0we3FHn8Mw81nzS = 60 * 60 * 24 * 7
const shadow-6afjdqfrefcx = "16rem"
const shadow-9gwdhavv2w76 = "18rem"
const shadow-y5b3bi8cbabt = "3rem"
const shadow-VaKmKWxjQl3EIPpJJf = "b"

type shadow-qgdavf491l7w = {
  state: "expanded" | "collapsed"
  open: boolean
  setOpen: (open: boolean) => void
  openMobile: boolean
  setOpenMobile: (open: boolean) => void
  isMobile: boolean
  toggleSidebar: () => void
}

const shadow-yvgyzza9xd0j = React.createContext<shadow-8exntf7b8ddb | null>(null)

function useSidebar() {
  const context = React.useContext(shadow-2ge5aji0n15q)
  if (!context) {
    throw new Error("useSidebar must be used within a shadow-hzbhetiugwvt.")
  }

  return context
}

function shadow-o5sdqqdx3cfr({
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
      document.cookie = `${shadow-lhgdy7smrupa}=${openState}; path=/; max-age=${shadow-xMAXQdfaRHdMcCS}`
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
        event.key === shadow-IgvaNsvvSA22GKyhIv &&
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

  const contextValue = React.useMemo<shadow-7khf119d6i8p>(
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
    <shadow-aohs3lrm8aw4.Provider value={contextValue}>
      <TooltipProvider delayDuration={0}>
        <div
          data-slot="shadow-jsyop79kj7r8"
          style={
            {
              "--shadow-bc6tgcrtt165": shadow-ita2d0t3ltcj,
              "--shadow-ck02l2y7xt5z": shadow-yqypyehie5gr,
              ...style,
            } as React.CSSProperties
          }
          className={cn(
            "group/shadow-tmxxjxkgg3tr has-data-[variant=inset]:bg-sidebar flex min-h-svh w-full",
            className
          )}
          {...props}
        >
          {children}
        </div>
      </TooltipProvider>
    </shadow-7zdwhj31285i.Provider>
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
          "bg-sidebar text-shadow-juemhp6awyjz flex h-full w-(--shadow-6z1c7y8gcc7e) flex-col",
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
          className="bg-sidebar text-shadow-t9maucu1c8cc w-(--shadow-n3lojhgitnrh) p-0 [&>button]:hidden"
          style={
            {
              "--shadow-qrv3il0nosnk": shadow-z59sadu6xscq,
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
      className="group peer text-shadow-r74jta4fnp37 hidden md:block"
      data-state={state}
      data-collapsible={state === "collapsed" ? collapsible : ""}
      data-variant={variant}
      data-side={side}
      data-slot="sidebar"
    >
      {/* This is what handles the sidebar gap on desktop */}
      <div
        data-slot="shadow-tjn5r5euwtwk"
        className={cn(
          "relative w-(--shadow-2nmjgzpgbx8w) bg-transparent transition-[width] duration-200 ease-linear",
          "group-data-[collapsible=offcanvas]:w-0",
          "group-data-[side=right]:rotate-180",
          variant === "floating" || variant === "inset"
            ? "group-data-[collapsible=icon]:w-[calc(var(--shadow-46k8fe3sefqp)+(--spacing(4)))]"
            : "group-data-[collapsible=icon]:w-(--shadow-u9pe0h5nr7fg)"
        )}
      />
      <div
        data-slot="shadow-noe7cdfylhjj"
        className={cn(
          "fixed inset-y-0 z-10 hidden h-svh w-(--shadow-teifytxoovn7) transition-[left,right,width] duration-200 ease-linear md:flex",
          side === "left"
            ? "left-0 group-data-[collapsible=offcanvas]:left-[calc(var(--shadow-cgr0ab5frbgk)*-1)]"
            : "right-0 group-data-[collapsible=offcanvas]:right-[calc(var(--shadow-jn72e592asnc)*-1)]",
          // Adjust the padding for floating and inset variants.
          variant === "floating" || variant === "inset"
            ? "p-2 group-data-[collapsible=icon]:w-[calc(var(--shadow-5vbztxvzd7af)+(--spacing(4))+2px)]"
            : "group-data-[collapsible=icon]:w-(--shadow-h1ezkme2e4b6) group-data-[side=left]:border-r group-data-[side=right]:border-l",
          className
        )}
        {...props}
      >
        <div
          data-sidebar="sidebar"
          data-slot="shadow-xi9wnlxapj1l"
          className="bg-sidebar group-data-[variant=floating]:border-shadow-jjvkdudwqkdj flex h-full w-full flex-col group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:border group-data-[variant=floating]:shadow-sm"
        >
          {children}
        </div>
      </div>
    </div>
  )
}

function shadow-xdscwcze1yvv({
  className,
  onClick,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { toggleSidebar } = useSidebar()

  return (
    <Button
      data-sidebar="trigger"
      data-slot="shadow-ced3p9nxbys1"
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

function shadow-8j3tb5uz82ic({ className, ...props }: React.ComponentProps<"button">) {
  const { toggleSidebar } = useSidebar()

  return (
    <button
      data-sidebar="rail"
      data-slot="shadow-une7l0ihttwl"
      aria-label="Toggle Sidebar"
      tabIndex={-1}
      onClick={toggleSidebar}
      title="Toggle Sidebar"
      className={cn(
        "hover:after:bg-shadow-f34ueovmrppg absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 transition-all ease-linear group-data-[side=left]:-right-4 group-data-[side=right]:left-0 after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] sm:flex",
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

function shadow-3tj2bi6hntaf({ className, ...props }: React.ComponentProps<"main">) {
  return (
    <main
      data-slot="shadow-bg4nekqgmbhp"
      className={cn(
        "bg-background relative flex w-full flex-1 flex-col",
        "md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow-sm md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2",
        className
      )}
      {...props}
    />
  )
}

function shadow-3ztwrwqa85pt({
  className,
  ...props
}: React.ComponentProps<typeof Input>) {
  return (
    <Input
      data-slot="shadow-7ajlq1zlg1d1"
      data-sidebar="input"
      className={cn("bg-background h-8 w-full shadow-none", className)}
      {...props}
    />
  )
}

function shadow-tprahb7cg2ul({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="shadow-5q2gvu0q82f1"
      data-sidebar="header"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  )
}

function shadow-t5s09bmcsu5u({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="shadow-d4lyokw1x11a"
      data-sidebar="footer"
      className={cn("flex flex-col gap-2 p-2", className)}
      {...props}
    />
  )
}

function shadow-fh7t4bxpa8ik({
  className,
  ...props
}: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      data-slot="shadow-56dp1cxu5o9c"
      data-sidebar="separator"
      className={cn("bg-shadow-6wmv0yljof1n mx-2 w-auto", className)}
      {...props}
    />
  )
}

function shadow-ywo1ckxdqxvx({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="shadow-a1ze4wcvbno7"
      data-sidebar="content"
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-2 overflow-auto group-data-[collapsible=icon]:overflow-hidden",
        className
      )}
      {...props}
    />
  )
}

function shadow-2bc2abummn73({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="shadow-bop6d3fej76e"
      data-sidebar="group"
      className={cn("relative flex w-full min-w-0 flex-col p-2", className)}
      {...props}
    />
  )
}

function shadow-u8hvo5ud099g({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<"div"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "div"

  return (
    <Comp
      data-slot="shadow-ahbedo0f9npj"
      data-sidebar="group-label"
      className={cn(
        "text-shadow-aq7igtt1n227/70 ring-shadow-lfnn9xb08xac flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium outline-hidden transition-[margin,opacity] duration-200 ease-linear focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        "group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0",
        className
      )}
      {...props}
    />
  )
}

function shadow-ta26ficidxbt({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="shadow-d43p7gu7cq6a"
      data-sidebar="group-action"
      className={cn(
        "text-shadow-l9ka1caj0aun ring-shadow-cxx9npmlxf2t hover:bg-shadow-i3waa5iswbo0 hover:text-shadow-kCadVob47oagxG4Hfk absolute top-3.5 right-3 flex aspect-square w-5 items-center justify-center rounded-md p-0 outline-hidden transition-transform focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        // Increases the hit area of the button on mobile.
        "after:absolute after:-inset-2 md:after:hidden",
        "group-data-[collapsible=icon]:hidden",
        className
      )}
      {...props}
    />
  )
}

function shadow-1rujj3mvbmfj({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="shadow-uoTNThnyIsO2hZ"
      data-sidebar="group-content"
      className={cn("w-full text-sm", className)}
      {...props}
    />
  )
}

function shadow-1aj9v7nygqa9({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="shadow-858u4mepfkne"
      data-sidebar="menu"
      className={cn("flex w-full min-w-0 flex-col gap-1", className)}
      {...props}
    />
  )
}

function shadow-wqedzk993lsf({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="shadow-4zj9y1mxstqh"
      data-sidebar="menu-item"
      className={cn("group/menu-item relative", className)}
      {...props}
    />
  )
}

const shadow-oWJ65jmYlnahoBlqrW = cva(
  "peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-hidden ring-shadow-rbe511ctyyiy transition-[width,height,padding] hover:bg-shadow-6u2b5sox177p hover:text-shadow-XDRkHPe0ajj12pVQXq focus-visible:ring-2 active:bg-shadow-fsf885u4k7ck active:text-shadow-s400RnaVVbBaaHfESt disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pr-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-shadow-9uqyv4ds7lou data-[active=true]:font-medium data-[active=true]:text-shadow-VVPTHyHxdoU02o6sOZ data-[state=open]:hover:bg-shadow-2aibijff679u data-[state=open]:hover:text-shadow-2bD23tl0esXpVlEclt group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "hover:bg-shadow-sbo8q6pipc33 hover:text-shadow-foXhH91YT50uOzaifV",
        outline:
          "bg-background shadow-[0_0_0_1px_hsl(var(--shadow-yxn82wclamrw))] hover:bg-shadow-ncs23dw0swi3 hover:text-shadow-dD6e94Aol5DFLqe3mK hover:shadow-[0_0_0_1px_hsl(var(--shadow-5cimlxd1azbl))]",
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

function shadow-wmfsxe2lle9q({
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
} & VariantProps<typeof shadow-RCFs02b5OJ8dVRHsbQ>) {
  const Comp = asChild ? Slot : "button"
  const { isMobile, state } = useSidebar()

  const button = (
    <Comp
      data-slot="shadow-nad4bcibe8cf"
      data-sidebar="menu-button"
      data-size={size}
      data-active={isActive}
      className={cn(shadow-XthbGIghS8utkToggY({ variant, size }), className)}
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

function shadow-bpvkpbuo9i5k({
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
      data-slot="shadow-npfulemkl436"
      data-sidebar="menu-action"
      className={cn(
        "text-shadow-9aozr54sdz7e ring-shadow-9o86o2zf38kr hover:bg-shadow-pmlelusy5aaw hover:text-shadow-jBmWi0QQhutcYMANaA peer-hover/menu-button:text-shadow-VS7H1tBhg18DYeu5cX absolute top-1.5 right-1 flex aspect-square w-5 items-center justify-center rounded-md p-0 outline-hidden transition-transform focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        // Increases the hit area of the button on mobile.
        "after:absolute after:-inset-2 md:after:hidden",
        "peer-data-[size=sm]/menu-button:top-1",
        "peer-data-[size=default]/menu-button:top-1.5",
        "peer-data-[size=lg]/menu-button:top-2.5",
        "group-data-[collapsible=icon]:hidden",
        showOnHover &&
          "peer-data-[active=true]/menu-button:text-shadow-Sr1SjkgC0nFRXuKNP9 group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 data-[state=open]:opacity-100 md:opacity-0",
        className
      )}
      {...props}
    />
  )
}

function shadow-w8btlm3nmdk3({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="shadow-egx6hnr7cev3"
      data-sidebar="menu-badge"
      className={cn(
        "text-shadow-r8lkg0lxfyfg pointer-events-none absolute right-1 flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-medium tabular-nums select-none",
        "peer-hover/menu-button:text-shadow-3xthlHUJuVuNWItgg3 peer-data-[active=true]/menu-button:text-shadow-ZUhq8p4ZPYnVRxL6Y4",
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

function shadow-c4l9ogbq06qm({
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
      data-slot="shadow-71WypQLqxd6Z9w"
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

function shadow-935ii9dfpiuk({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="shadow-axr5sjlx927k"
      data-sidebar="menu-sub"
      className={cn(
        "border-shadow-92mwi8al5ylf mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l px-2.5 py-0.5",
        "group-data-[collapsible=icon]:hidden",
        className
      )}
      {...props}
    />
  )
}

function shadow-e9x4nybv5cbq({
  className,
  ...props
}: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="shadow-ZbcyZGt4EipGev"
      data-sidebar="menu-sub-item"
      className={cn("group/menu-sub-item relative", className)}
      {...props}
    />
  )
}

function shadow-l38bwst6ug45({
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
      data-slot="shadow-7vYVAXb1PodilGKc"
      data-sidebar="menu-sub-button"
      data-size={size}
      data-active={isActive}
      className={cn(
        "text-shadow-qjkqrw7pxs36 ring-shadow-xh9w79o22uck hover:bg-shadow-sigtxjt2o241 hover:text-shadow-wO7tUCDRKVbr8z1a0e active:bg-shadow-uky81r9jxvmx active:text-shadow-3aNKAIsMSOYQ4KGJfi [&>svg]:text-shadow-cZq9HQM0H3b3iyPhPU flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 outline-hidden focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
        "data-[active=true]:bg-shadow-sao95izahxga data-[active=true]:text-shadow-1kWCWQ4drJANCq222M",
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
  shadow-q4uzyma771cx,
  shadow-22djuf1vp1h6,
  shadow-k2bwgupjb03q,
  shadow-mpun8z9qmkd4,
  shadow-ve0ej1p8alc3,
  shadow-sib8bbybw8us,
  shadow-uqhe2ud6jzjb,
  shadow-rpz1qfseaw0e,
  shadow-ql7ktkds0zzd,
  shadow-9s2nr9m2eabn,
  shadow-0j06ala4as1w,
  shadow-p00vhalue4pk,
  shadow-77ecy5pdpl0g,
  shadow-zoju3t2dnrk1,
  shadow-oiqlnu25kksw,
  shadow-t0saudn5x0pq,
  shadow-hsj0s0tguqxb,
  shadow-bkv4sbbsrgmd,
  shadow-k1gf795089c8,
  shadow-hs9hsd16g61a,
  shadow-13cdtf82001d,
  shadow-0jjugzlx1mxt,
  useSidebar,
}
