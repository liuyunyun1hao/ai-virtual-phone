import styles from "./location-map.module.css";
import { AppleLogo } from "./apple-pay-brand";

export function AppleMapsBrand() {
    return <span className={styles.brand}><AppleLogo /><strong>Maps</strong></span>;
}

export function LocationPin({ className }: { className?: string }) {
    return (
        <svg className={className} width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M10 2.009c-2.762 0-5 2.229-5 4.99c0 4.774 5 11 5 11s5-6.227 5-11c0-2.76-2.238-4.99-5-4.99m0 7.751a2.7 2.7 0 1 1 0-5.4a2.7 2.7 0 0 1 0 5.4" />
        </svg>
    );
}

/** Stylized illustration: a location name is not a geocoded map coordinate. */
export function LocationMap() {
    return (
        <div className={styles.map} aria-hidden="true">
            <svg className={styles.streets} viewBox="0 0 320 160" preserveAspectRatio="xMidYMid slice" fill="none">
                <path fill="#e8ede4" d="M15 22h66v40H15zM226 94h75v50h-75z" />
                <path fill="#ece9e3" d="M114 18h65v45h-65zM26 100h79v39H26zM216 20h53v35h-53z" />
                <path d="M280-20c-45 34-10 62-45 87s-38 65-18 110" stroke="#d8e7ed" strokeWidth="30" />
                <g stroke="#d5d7d5" strokeWidth="13">
                    <path d="M-15 81h350M97-10v190M198-10v190M-10 149 329 9" />
                </g>
                <g stroke="#fff" strokeWidth="10">
                    <path d="M-15 81h350M97-10v190M198-10v190M-10 149 329 9" />
                </g>
                <path className={styles.route} d="M54 123h43V81h79" stroke="#819da8" strokeWidth="2.5" strokeDasharray="2 7" strokeLinecap="round" />
                <circle cx="54" cy="123" r="5" fill="#819da8" stroke="white" strokeWidth="2" />
            </svg>
            <span className={styles.destination}>
                <span className={styles.pulse} />
                <LocationPin className={styles.pin} />
            </span>
            <AppleMapsBrand />
        </div>
    );
}

export function LocationCard({ label }: { label: string }) {
    return (
        <div className={`chat-location-card ${styles.card}`}>
            <LocationMap />
            <div className={styles.caption}>
                <span className={styles.label} title={label}>{label}</span>
            </div>
        </div>
    );
}
