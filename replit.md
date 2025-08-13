# Swap Comparison Tool

## Overview

A web application for comparing cryptocurrency swap rates across multiple providers. The system allows users to select source and destination chains/tokens, configure swap amounts, and view real-time quotes from different swap providers like LiFi and Bungee. Users can also manage swap providers through a provider management interface.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript using Vite as the build tool
- **UI Library**: Shadcn/ui components built on top of Radix UI primitives
- **Styling**: Tailwind CSS with CSS custom properties for theming
- **State Management**: TanStack React Query for server state and React hooks for local state
- **Routing**: Wouter for lightweight client-side routing
- **Forms**: React Hook Form with Zod validation

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **API Design**: RESTful endpoints for provider management, chain/token data, and quote fetching
- **Database**: PostgreSQL with Drizzle ORM for type-safe database operations
- **Storage Layer**: Abstracted storage interface with in-memory implementation for development
- **Validation**: Zod schemas shared between client and server

### Database Design
- **Users Table**: Basic user authentication structure (id, username, password)
- **Swap Providers Table**: Configuration for external swap APIs (name, endpoint, API key, active status)
- **Schema Location**: Shared schema definitions in `/shared/schema.ts` for type safety

### Development Setup
- **Monorepo Structure**: Client and server code in separate directories with shared types
- **Build Process**: Vite for frontend bundling, ESBuild for server bundling
- **Development Server**: Integrated Vite dev server with Express API routes
- **Database Migrations**: Drizzle Kit for schema management and migrations

### Key Features
- **Multi-Provider Comparison**: Support for multiple swap providers with unified interface
- **Chain/Token Selection**: Searchable dropdowns for blockchain networks and tokens
- **Custom Amount Configuration**: Pre-defined amounts with custom amount support
- **Real-time Quotes**: Fetching and displaying swap quotes from multiple providers
- **Provider Management**: Admin interface for adding/configuring swap providers
- **Responsive Design**: Mobile-first design with proper responsive breakpoints

## External Dependencies

### Database
- **PostgreSQL**: Primary database using Neon serverless PostgreSQL
- **Drizzle ORM**: Type-safe database queries and migrations
- **Connection**: Environment-based DATABASE_URL configuration

### Swap Providers
- **LiFi**: Cross-chain swap aggregator (https://li.quest/v1)
- **Bungee (Socket)**: Multi-chain bridge aggregator (https://api.socket.tech/v2)
- **API Keys**: Optional API key configuration for enhanced rate limits

### UI Framework
- **Radix UI**: Unstyled, accessible UI primitives
- **Tailwind CSS**: Utility-first CSS framework
- **Shadcn/ui**: Pre-built component library with customizable styling

### Development Tools
- **Vite**: Frontend build tool with hot module replacement
- **TypeScript**: Static type checking across the entire stack
- **TanStack React Query**: Server state management and caching
- **React Hook Form**: Form handling with validation
- **Zod**: Runtime type validation and schema definition

### Deployment
- **Build Output**: Static frontend assets and bundled server code
- **Environment Variables**: Database URL and optional API keys
- **Session Management**: PostgreSQL-based session storage with connect-pg-simple