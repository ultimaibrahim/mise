-- ==============================================================================
-- MISE 2.0 — ARCHITECTURE LEDGER & KITCHEN COMMISSARY ENGINE
-- Author: Ibrahim García (Product Architect)
-- Philosophy: Crystal & Squircle Standard · Zero Data Loss · Immutable FIFO Ledger
-- ==============================================================================

-- Enable UUID & Crypto extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- 1. ORGANIZATIONS & BRANCHES (Sucursales y Almacén Central)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(10) UNIQUE NOT NULL,            -- 'bdg', 'pda', 'pdm'
    name VARCHAR(100) NOT NULL,                  -- 'Bodega General', 'Andares', 'Mercado'
    branch_type VARCHAR(20) NOT NULL CHECK (branch_type IN ('COMMISSARY', 'STORE', 'WAREHOUSE')),
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    google_sheet_id VARCHAR(100),                -- Mirror Sheet ID
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Seed Initial Branches
INSERT INTO branches (code, name, branch_type, google_sheet_id) VALUES
    ('bdg', 'Bodega General LCP', 'COMMISSARY', '1bQR0TJUqY9jmtapblMiGY-FKCAB6xfLz535BLRgC_IY'),
    ('pda', 'La Crêpe Parisienne - Andares', 'STORE', '1f5p6FbSvyGDIEENHndpXX4T10xzoXXsrYxAJCD-3pug'),
    ('pdm', 'La Crêpe Parisienne - Mercado Andares', 'STORE', '1QdqX58a9AwjxFVjQXy8AhlSMNN9-fxZCeiVXts4pVmc')
ON CONFLICT (code) DO UPDATE 
SET name = EXCLUDED.name, google_sheet_id = EXCLUDED.google_sheet_id;

-- ------------------------------------------------------------------------------
-- 2. CATEGORIES & MASTER PRODUCTS (Catálogo Maestro)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) UNIQUE NOT NULL,            -- 'ABARROTES', 'LÁCTEOS', 'DESECHABLES', etc.
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku VARCHAR(30) UNIQUE,
    name VARCHAR(150) NOT NULL,
    category_id UUID REFERENCES product_categories(id) ON DELETE SET NULL,
    base_unit VARCHAR(15) NOT NULL,              -- 'KG', 'LT', 'PZA', 'PAQ', 'BOTE'
    min_par_andares NUMERIC(10, 2) DEFAULT 0,
    max_par_andares NUMERIC(10, 2) DEFAULT 0,
    min_par_mercado NUMERIC(10, 2) DEFAULT 0,
    max_par_mercado NUMERIC(10, 2) DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);

-- ------------------------------------------------------------------------------
-- 3. THE IMMUTABLE INVENTORY LEDGER (Transacciones Inmutables FIFO)
-- Copiado del estándar Enterprise de Restaurant365:
-- Ningún registro se edita ni se borra. Correcciones = transacción contraria.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    tx_type VARCHAR(30) NOT NULL CHECK (tx_type IN (
        'COMMISSARY_DISPATCH',     -- Salida de Bodega Central hacia tienda
        'STORE_RECEIVE',           -- Entrada confirmada en tienda
        'STORE_CONSUMPTION',       -- Consumo / Ventas calculadas
        'BLIND_AUDIT_ADJUSTMENT',  -- Ajuste derivado de conteo ciego físico
        'WASTE_MERMA',             -- Merma o insumo caducado
        'INITIAL_BALANCE',         -- Saldo inicial de arranque
        'TRANSFER_CORRECTION'      -- Contrarrecibo para subsanar discrepancias
    )),
    quantity NUMERIC(12, 4) NOT NULL,            -- Positivo: Entrada / Negativo: Salida
    unit VARCHAR(15) NOT NULL,
    batch_lot VARCHAR(50),
    expiration_date DATE,
    idempotency_hash VARCHAR(128) UNIQUE NOT NULL, -- Previene duplicaciones por doble clic o reintentos de red
    reference_order_id UUID,                      -- Enlace a pedido u orden de surtido
    actor_email VARCHAR(100) DEFAULT 'system',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ledger_branch_prod ON inventory_transactions(branch_id, product_id);
CREATE INDEX IF NOT EXISTS idx_ledger_created_at ON inventory_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_hash ON inventory_transactions(idempotency_hash);

-- ------------------------------------------------------------------------------
-- 4. ORDERS & DISPATCH WORKFLOW (Flujo de Pedido Móvil y Despacho)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID NOT NULL REFERENCES branches(id),
    order_date DATE NOT NULL DEFAULT CURRENT_DATE,
    week_number INT NOT NULL,                     -- Ej: Semana 37
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN (
        'DRAFT',        -- Guardado borrador en teléfono
        'SUBMITTED',    -- Enviado a Bodega General
        'IN_PICKING',   -- Bodega preparando en quiosco táctil
        'DISPATCHED',   -- En camino / en ruta
        'RECEIVED',     -- Tienda confirmó recepción física
        'CANCELLED'
    )),
    total_items INT DEFAULT 0,
    submitted_at TIMESTAMP WITH TIME ZONE,
    dispatched_at TIMESTAMP WITH TIME ZONE,
    received_at TIMESTAMP WITH TIME ZONE,
    created_by VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    CONSTRAINT unique_daily_branch_order UNIQUE (branch_id, order_date)
);

CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    quantity_requested NUMERIC(10, 2) NOT NULL CHECK (quantity_requested >= 0),
    quantity_dispatched NUMERIC(10, 2) DEFAULT 0,
    quantity_received NUMERIC(10, 2),
    fulfillment_status VARCHAR(20) DEFAULT 'PENDING' CHECK (fulfillment_status IN (
        'PENDING', 'COMPLETE', 'PARTIAL', 'OUT_OF_STOCK', 'EXCESS'
    )),
    is_addition BOOLEAN DEFAULT FALSE NOT NULL,   -- '🚨 ADICIÓN' de última hora
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    CONSTRAINT unique_order_product UNIQUE (order_id, product_id)
);

-- ------------------------------------------------------------------------------
-- 5. BLIND AUDITING (Conteo Físico Ciego - Estándar Restaurant365)
-- El operador cuenta sin ver los saldos teóricos para evitar sesgos o fraudes.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS blind_counts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID NOT NULL REFERENCES branches(id),
    count_date DATE NOT NULL DEFAULT CURRENT_DATE,
    auditor_name VARCHAR(100) NOT NULL,
    status VARCHAR(20) DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'REVIEWING', 'COMMITTED')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    committed_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS blind_count_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blind_count_id UUID NOT NULL REFERENCES blind_counts(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    physical_count NUMERIC(10, 2) NOT NULL,
    theoretical_count_at_audit NUMERIC(10, 2),    -- Calculado al momento del cierre
    discrepancy NUMERIC(10, 2),                    -- physical - theoretical
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- ------------------------------------------------------------------------------
-- 6. SHEETS MIRROR SYNC LOG (Garantía de Sincronización Bidireccional)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sheets_sync_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID REFERENCES branches(id),
    direction VARCHAR(15) NOT NULL CHECK (direction IN ('SHEETS_TO_WEB', 'WEB_TO_SHEETS')),
    event_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('SUCCESS', 'WARNING', 'ERROR')),
    payload JSONB,
    error_message TEXT,
    latency_ms INT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- ------------------------------------------------------------------------------
-- 7. REAL-TIME STOCK BALANCE VIEW (Vista Instantánea de Saldos)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_current_stock AS
SELECT 
    b.id AS branch_id,
    b.code AS branch_code,
    b.name AS branch_name,
    p.id AS product_id,
    p.name AS product_name,
    p.base_unit,
    pc.name AS category_name,
    COALESCE(SUM(t.quantity), 0) AS current_stock,
    CASE 
        WHEN b.code = 'pda' THEN p.min_par_andares
        WHEN b.code = 'pdm' THEN p.min_par_mercado
        ELSE 0
    END AS min_par,
    CASE 
        WHEN b.code = 'pda' THEN p.max_par_andares
        WHEN b.code = 'pdm' THEN p.max_par_mercado
        ELSE 0
    END AS max_par
FROM branches b
CROSS JOIN products p
LEFT JOIN product_categories pc ON p.category_id = pc.id
LEFT JOIN inventory_transactions t ON t.branch_id = b.id AND t.product_id = p.id
WHERE p.is_active = TRUE AND b.is_active = TRUE
GROUP BY b.id, b.code, b.name, p.id, p.name, p.base_unit, pc.name, p.min_par_andares, p.max_par_andares, p.min_par_mercado, p.max_par_mercado;
