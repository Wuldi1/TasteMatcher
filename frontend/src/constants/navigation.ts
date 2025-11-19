import { Home, Compass, Upload, LayoutGrid, Users, Sparkles, ShoppingCart } from 'lucide-react';

export interface NavigationLink {
    id: string;
    name: string;
    href: string;
    ariaLabel: string;
    icon: React.ComponentType;
    roles: string[]; // Roles that can access this link
    bubbleText: string; // Text to display in the tour bubble
}

export const NAVIGATION_LINKS: NavigationLink[] = [
    { 
        id: 'home', 
        name: 'Home', 
        href: '/home', 
        icon: Home, 
        roles: ['customer', 'dealer', 'domain_owner', 'global_admin'], 
        ariaLabel: 'Navigate to home page',
        bubbleText: 'This is the Home page. Here you can see an overview of your dashboard.' 
    },
    { 
        id: 'catalog', 
        name: 'Catalog', 
        href: '/catalog', 
        icon: LayoutGrid, 
        roles: ['customer', 'dealer', 'domain_owner', 'global_admin'], 
        ariaLabel: 'Navigate to catalog',
        bubbleText: 'This is the Catalog page. Browse all available art pieces.' 
    },
    { 
        id: 'upload', 
        name: 'Upload', 
        href: '/upload', 
        icon: Upload, 
        roles: ['dealer', 'domain_owner', 'global_admin'], 
        ariaLabel: 'Navigate to upload page',
        bubbleText: 'This is the Upload page. Add new artworks to your collection.' 
    },
    { 
        id: 'taster', 
        name: 'Taster', 
        href: '/taster', 
        icon: Compass, 
        roles: ['customer'], 
        ariaLabel: 'Navigate to taster page',
        bubbleText: 'This is the Taster page. Swipe through artworks to refine your preferences.' 
    },
    { 
        id: 'ai-suggestions', 
        name: 'AI Suggestions', 
        href: '/ai-suggestions', 
        icon: Sparkles, 
        roles: ['customer'], 
        ariaLabel: 'Navigate to AI Suggestions page',
        bubbleText: 'This is the AI Suggestions page. Get personalized recommendations.' 
    },
    {
        id: 'sales',
        name: 'Sales',
        href: '/sales',
        icon: ShoppingCart,
        roles: ['dealer', 'domain_owner', 'global_admin'],
        ariaLabel: 'Navigate to sales page',
        bubbleText: 'This is the Sales page. Select a user, view catalog, AI suggestions and manage sale proposals.'
    },
    { 
        id: 'management', 
        name: 'Management', 
        href: '/management', 
        icon: Users, 
        roles: ['dealer', 'domain_owner', 'global_admin'], 
        ariaLabel: 'Navigate to management page',
        bubbleText: 'This is the Management page. Manage users and domains here.' 
    },
];