import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AtSignIcon,
  ChevronsUpDownIcon,
  InboxIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  MailsIcon,
  PaletteIcon,
  PlusIcon,
  UsersIcon,
} from 'lucide-react';
import { NavLink, useLocation, useNavigate } from 'react-router';
import { BrandMark } from '@/components/brand';
import { NewAliasDialog } from '@/components/new-alias-dialog';
import { ThemeRadioItems } from '@/components/theme-toggle';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar';
import { api } from '@/lib/api';
import { initials } from '@/lib/format';
import { aliasesQuery, useMe } from '@/lib/queries';

function Unread({ n }: { n: number }) {
  if (!n) return null;
  return (
    <SidebarMenuBadge className="bg-primary/10 text-foreground">
      {n > 99 ? '99+' : n}
      <span className="sr-only"> unread</span>
    </SidebarMenuBadge>
  );
}

export function AppSidebar() {
  const me = useMe();
  const { pathname } = useLocation();
  const aliases = useQuery(aliasesQuery);
  const [creating, setCreating] = useState(false);
  const totalUnread = aliases.data?.reduce((n, a) => n + a.unreadCount, 0) ?? 0;
  const allActive = pathname === '/' || pathname.startsWith('/m/');

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <NavLink to="/">
                <BrandMark />
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-semibold">temp mail</span>
                  <span className="truncate text-xs text-muted-foreground">@{me.domain}</span>
                </div>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent role="navigation" aria-label="Mailboxes">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={allActive} tooltip="All mail">
                  <NavLink to="/">
                    <InboxIcon />
                    <span>All mail</span>
                  </NavLink>
                </SidebarMenuButton>
                <Unread n={totalUnread} />
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Aliases</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {aliases.isPending &&
                Array.from({ length: 3 }, (_, i) => (
                  <SidebarMenuItem key={i}>
                    <SidebarMenuSkeleton showIcon />
                  </SidebarMenuItem>
                ))}
              {aliases.data?.map((a) => {
                const href = `/a/${encodeURIComponent(a.address)}`;
                const local = a.address.split('@')[0];
                return (
                  <SidebarMenuItem key={a.address}>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === href || pathname.startsWith(`${href}/`)}
                      tooltip={a.address}
                    >
                      <NavLink to={href}>
                        <AtSignIcon />
                        <span className={a.unreadCount ? 'font-medium' : undefined}>{local}</span>
                      </NavLink>
                    </SidebarMenuButton>
                    <Unread n={a.unreadCount} />
                  </SidebarMenuItem>
                );
              })}
              {aliases.data?.length === 0 && (
                <p className="px-2 py-1.5 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                  {me.canCreate
                    ? 'No aliases yet. Create one to start receiving mail.'
                    : 'No aliases have been shared with you yet.'}
                </p>
              )}
              {me.canCreate && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => setCreating(true)}
                    tooltip="New alias"
                    className="text-muted-foreground"
                  >
                    <PlusIcon />
                    <span>New alias</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {me.isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {[
                  { to: '/admin', label: 'Overview', icon: LayoutDashboardIcon },
                  { to: '/admin/users', label: 'Users', icon: UsersIcon },
                  { to: '/admin/aliases', label: 'Aliases', icon: MailsIcon },
                ].map((l) => (
                  <SidebarMenuItem key={l.to}>
                    <SidebarMenuButton asChild isActive={pathname === l.to} tooltip={l.label}>
                      <NavLink to={l.to} end>
                        <l.icon />
                        <span>{l.label}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter>
        <UserMenu />
      </SidebarFooter>
      <SidebarRail />
      {me.canCreate && <NewAliasDialog open={creating} onOpenChange={setCreating} />}
    </Sidebar>
  );
}

function UserMenu() {
  const me = useMe();
  const { isMobile } = useSidebar();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: () => {
      qc.clear();
      void navigate('/login', { replace: true });
    },
  });
  const avatar = (
    <Avatar className="rounded-lg">
      {me.avatarUrl && <AvatarImage src={me.avatarUrl} alt="" />}
      <AvatarFallback className="rounded-lg">{initials(me.name)}</AvatarFallback>
    </Avatar>
  );
  const role = me.isAdmin ? 'Admin' : me.canCreate ? 'Member' : 'Reader';

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              aria-label="Account menu"
            >
              {avatar}
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{me.name}</span>
                <span className="truncate text-xs text-muted-foreground">{role}</span>
              </div>
              <ChevronsUpDownIcon className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? 'bottom' : 'right'}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                {avatar}
                <div className="grid flex-1 leading-tight">
                  <span className="truncate font-medium">{me.name}</span>
                  <span className="truncate font-mono text-xs text-muted-foreground">{me.id}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <PaletteIcon />
                Theme
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <ThemeRadioItems />
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => logout.mutate()} disabled={logout.isPending}>
              <LogOutIcon />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
