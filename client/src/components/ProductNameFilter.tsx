/**
 * Multi-select product name filter
 * Shows unique product names from the data, sorted by order count descending.
 * User can select/deselect multiple products. When none selected = show all.
 */

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, X, Package, Check } from 'lucide-react';

interface ProductNameFilterProps {
  products: { name: string; count: number }[];
  selected: Set<string>;
  onChange: (selected: Set<string>) => void;
}

export default function ProductNameFilter({ products, selected, onChange }: ProductNameFilterProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const toggle = (name: string) => {
    const next = new Set(selected);
    if (next.has(name)) {
      next.delete(name);
    } else {
      next.add(name);
    }
    onChange(next);
  };

  const clearAll = () => {
    onChange(new Set());
    setOpen(false);
  };

  const isActive = selected.size > 0;

  return (
    <div ref={ref} className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setOpen(!open)}
        className={`
          flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border
          ${isActive
            ? 'bg-primary text-primary-foreground border-primary shadow-sm'
            : 'bg-secondary/60 text-muted-foreground border-border/50 hover:bg-secondary hover:text-foreground'
          }
        `}
      >
        <Package className="h-3 w-3" />
        {isActive ? `${selected.size} product${selected.size > 1 ? 's' : ''}` : 'Filter by Product'}
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Selected tags */}
      {isActive && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {Array.from(selected).map(name => (
            <span
              key={name}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[10px] font-semibold"
            >
              {name}
              <button
                onClick={(e) => { e.stopPropagation(); toggle(name); }}
                className="hover:text-primary/70"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
          <button
            onClick={clearAll}
            className="text-[10px] text-muted-foreground hover:text-foreground underline"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full left-0 mt-1 w-72 max-h-80 bg-card border border-border rounded-xl shadow-lg z-50 overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-border/50">
            <input
              type="text"
              placeholder="Search products..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-secondary/50 border border-border/50 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
              autoFocus
            />
          </div>

          {/* Product list */}
          <div className="overflow-y-auto max-h-60">
            {filtered.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">
                No products found
              </div>
            ) : (
              filtered.map(product => {
                const isSelected = selected.has(product.name);
                return (
                  <button
                    key={product.name}
                    onClick={() => toggle(product.name)}
                    className={`
                      w-full flex items-center justify-between px-3 py-2 text-left text-xs transition-colors
                      ${isSelected
                        ? 'bg-primary/5 text-foreground'
                        : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                      }
                    `}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`
                        h-4 w-4 rounded border flex items-center justify-center transition-colors
                        ${isSelected
                          ? 'bg-primary border-primary'
                          : 'border-border/80 bg-transparent'
                        }
                      `}>
                        {isSelected && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                      </div>
                      <span className={`font-medium ${isSelected ? 'text-foreground' : ''}`}>
                        {product.name}
                      </span>
                    </div>
                    <span className="font-data text-[10px] text-muted-foreground">
                      {product.count.toLocaleString()} orders
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
