"use client";
import { useState, useRef, useEffect } from "react";
import { MapPin, Loader2, Navigation } from "lucide-react";

interface Suggestion {
    display_name: string;
    address: {
        road?: string;
        suburb?: string;
        city_district?: string;
        city?: string;
        county?: string;
        neighbourhood?: string;
        building?: string;
    };
    lat: string;
    lon: string;
}

interface Props {
    onSelect: (street: string, area: string) => void;
    streetValue: string;
    areaValue: string;
}

export default function LocationSearch({ onSelect, streetValue, areaValue }: Props) {
    const [query, setQuery] = useState(streetValue || "");
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [loading, setLoading] = useState(false);
    const [gpsLoading, setGpsLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const debounceRef = useRef<NodeJS.Timeout>();
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, []);

    const search = (value: string) => {
        setQuery(value);
        if (value.length < 3) { setSuggestions([]); setOpen(false); return; }
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(async () => {
            setLoading(true);
            try {
                const res = await fetch(
                    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(value + ", Nairobi, Kenya")}&format=json&addressdetails=1&limit=5&countrycodes=ke`,
                    { headers: { "Accept-Language": "en" } }
                );
                const data = await res.json();
                setSuggestions(data);
                setOpen(data.length > 0);
            } catch { }
            setLoading(false);
        }, 400);
    };

    const handleSelect = (s: Suggestion) => {
        const addr = s.address;
        const street = [addr.building, addr.road].filter(Boolean).join(", ") || s.display_name.split(",")[0];
        const area = addr.suburb || addr.neighbourhood || addr.city_district || addr.county || "Nairobi";
        setQuery(street);
        setSuggestions([]);
        setOpen(false);
        onSelect(street, area);
    };

    const handleGPS = () => {
        if (!navigator.geolocation) { return; }
        setGpsLoading(true);
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                try {
                    const res = await fetch(
                        `https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json&addressdetails=1`,
                        { headers: { "Accept-Language": "en" } }
                    );
                    const data = await res.json();
                    const addr = data.address;
                    const street = [addr.building, addr.road].filter(Boolean).join(", ") || data.display_name.split(",")[0];
                    const area = addr.suburb || addr.neighbourhood || addr.city_district || addr.county || "Nairobi";
                    setQuery(street);
                    onSelect(street, area);
                } catch { }
                setGpsLoading(false);
            },
            () => setGpsLoading(false),
            { timeout: 8000 }
        );
    };

    return (
        <div ref={wrapperRef} className="relative">
            <div className="relative">
                <MapPin size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
                <input
                    value={query}
                    onChange={(e) => search(e.target.value)}
                    onFocus={() => suggestions.length > 0 && setOpen(true)}
                    placeholder="Search your street or building..."
                    className="w-full pl-9 pr-10 py-2 bg-white/10 border border-white/20 rounded-lg text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:bg-white/15 transition-all"
                />
                <button
                    type="button"
                    onClick={handleGPS}
                    title="Use my location"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-white/50 hover:text-blue-300 transition-colors"
                >
                    {gpsLoading
                        ? <Loader2 size={15} className="animate-spin" />
                        : <Navigation size={15} />
                    }
                </button>
            </div>

            {open && suggestions.length > 0 && (
                <div className="absolute z-50 mt-1 w-full rounded-xl overflow-hidden shadow-2xl" style={{ background: 'rgba(8,16,40,0.97)', border: '1px solid rgba(255,255,255,0.12)' }}>
                    {loading && (
                        <div className="px-4 py-2 text-xs text-white/40 flex items-center gap-2">
                            <Loader2 size={12} className="animate-spin" /> Searching...
                        </div>
                    )}
                    {suggestions.map((s, i) => {
                        const addr = s.address;
                        const main = [addr.building, addr.road].filter(Boolean).join(", ") || s.display_name.split(",")[0];
                        const sub = addr.suburb || addr.neighbourhood || addr.city_district || "";
                        return (
                            <button
                                key={i}
                                type="button"
                                onClick={() => handleSelect(s)}
                                className="w-full text-left px-4 py-3 hover:bg-white/10 transition-colors border-b border-white/5 last:border-0"
                            >
                                <p className="text-sm text-white font-medium truncate">{main}</p>
                                {sub && <p className="text-xs text-white/40 truncate">{sub}, Nairobi</p>}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}