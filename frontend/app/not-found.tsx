import Link from "next/link";
import { SearchX, Home } from "lucide-react";

export default function NotFound() {
    return (
        <div className="min-h-[70vh] flex items-center justify-center px-4">
            <div className="max-w-md w-full text-center">
                <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-5">
                    <SearchX size={28} className="text-blue-500" />
                </div>
                <h1 className="text-xl font-bold text-gray-900 mb-2">Page not found</h1>
                <p className="text-sm text-gray-500 mb-6">
                    We couldn&apos;t find what you&apos;re looking for. It may have moved, or the link might be incorrect.
                </p>
                <Link
                    href="/"
                    className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors"
                >
                    <Home size={14} />
                    Go home
                </Link>
            </div>
        </div>
    );
}