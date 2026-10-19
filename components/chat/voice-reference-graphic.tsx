"use client";
// Geometry copied from the supplied _Message - Audio.svg (incoming 280 × 76 variant).
// Only the surface and dynamic time are supplied by the app.
export function VoiceReferenceGraphic({ playing, synthesizing, failed, duration }: { playing: boolean; synthesizing: boolean; failed: boolean; duration: number }) {
    const seconds = Math.max(0, Math.round(duration));
    const time = Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
    return <svg className="voice-reference" viewBox="20 110 280 76" width="280" height="76" aria-hidden="true" data-playing={playing || undefined}>
        {synthesizing ? <g className="voice-reference-loading"><circle cx="50.5" cy="147.629" r="12" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="55 25"/></g> : playing
            ? <path fill="currentColor" fillRule="evenodd" d="M50.5 133.684a13.945 13.945 0 1 1 0 27.89a13.945 13.945 0 1 1 0-27.89Z M46 142h3v11h-3Z M52 142h3v11h-3Z"/>
            : <path fill="currentColor" fillRule="evenodd" d="M50.5 161.574C48.5768 161.574 46.7721 161.21 45.0859 160.48C43.3997 159.76 41.9186 158.762 40.6426 157.486C39.3665 156.201 38.3639 154.72 37.6348 153.043C36.9147 151.357 36.5547 149.552 36.5547 147.629C36.5547 145.706 36.9147 143.901 37.6348 142.215C38.3639 140.529 39.3665 139.048 40.6426 137.771C41.9186 136.495 43.3997 135.497 45.0859 134.777C46.7721 134.048 48.5768 133.684 50.5 133.684C52.4232 133.684 54.2279 134.048 55.9141 134.777C57.6003 135.497 59.0814 136.495 60.3574 137.771C61.6335 139.048 62.6315 140.529 63.3516 142.215C64.0807 143.901 64.4453 145.706 64.4453 147.629C64.4453 149.552 64.0807 151.357 63.3516 153.043C62.6315 154.72 61.6335 156.201 60.3574 157.486C59.0814 158.762 57.6003 159.76 55.9141 160.48C54.2279 161.21 52.4232 161.574 50.5 161.574ZM47.9023 153.139L55.9414 148.408C56.1328 148.29 56.2604 148.135 56.3242 147.943C56.388 147.743 56.388 147.547 56.3242 147.355C56.2604 147.155 56.1328 147 55.9414 146.891L47.9023 142.133C47.7018 142.014 47.4922 141.964 47.2734 141.982C47.0547 142.001 46.8678 142.074 46.7129 142.201C46.5671 142.329 46.4941 142.507 46.4941 142.734V152.537C46.4941 152.765 46.5671 152.947 46.7129 153.084C46.8587 153.221 47.0365 153.298 47.2461 153.316C47.4648 153.335 47.6836 153.275 47.9023 153.139Z"/>}
        <g className="voice-reference-wave" fill="currentColor"><rect x="77" y="146" width="2" height="4" rx="1" style={{animationDelay:"0.000s"}}/>
<rect x="81" y="146" width="2" height="4" rx="1" style={{animationDelay:"0.035s"}}/>
<rect x="85" y="145" width="2" height="6" rx="1" style={{animationDelay:"0.070s"}}/>
<rect x="89" y="144" width="2" height="8" rx="1" style={{animationDelay:"0.105s"}}/>
<rect x="93" y="142" width="2" height="12" rx="1" style={{animationDelay:"0.140s"}}/>
<rect x="97" y="146" width="2" height="4" rx="1" style={{animationDelay:"0.175s"}}/>
<rect x="101" y="146" width="2" height="4" rx="1" style={{animationDelay:"0.210s"}}/>
<rect x="105" y="145" width="2" height="6" rx="1" style={{animationDelay:"0.245s"}}/>
<rect x="109" y="141" width="2" height="14" rx="1" style={{animationDelay:"0.280s"}}/>
<rect x="113" y="139" width="2" height="18" rx="1" style={{animationDelay:"0.315s"}}/>
<rect x="117" y="141" width="2" height="14" rx="1" style={{animationDelay:"0.350s"}}/>
<rect x="121" y="138" width="2" height="20" rx="1" style={{animationDelay:"0.385s"}}/>
<rect x="125" y="139" width="2" height="18" rx="1" style={{animationDelay:"0.420s"}}/>
<rect x="129" y="135" width="2" height="26" rx="1" style={{animationDelay:"0.455s"}}/>
<rect x="133" y="139" width="2" height="18" rx="1" style={{animationDelay:"0.490s"}}/>
<rect x="137" y="139" width="2" height="18" rx="1" style={{animationDelay:"0.525s"}}/>
<rect x="141" y="138" width="2" height="20" rx="1" style={{animationDelay:"0.560s"}}/>
<rect x="145" y="142" width="2" height="12" rx="1" style={{animationDelay:"0.595s"}}/>
<rect x="149" y="144" width="2" height="8" rx="1" style={{animationDelay:"0.630s"}}/>
<rect x="153" y="146" width="2" height="4" rx="1" style={{animationDelay:"0.665s"}}/>
<rect x="157" y="144" width="2" height="8" rx="1" style={{animationDelay:"0.700s"}}/>
<rect x="161" y="142" width="2" height="12" rx="1" style={{animationDelay:"0.735s"}}/>
<rect x="165" y="143" width="2" height="10" rx="1" style={{animationDelay:"0.770s"}}/>
<rect x="169" y="141" width="2" height="14" rx="1" style={{animationDelay:"0.805s"}}/>
<rect x="173" y="138" width="2" height="20" rx="1" style={{animationDelay:"0.840s"}}/>
<rect x="177" y="137" width="2" height="22" rx="1" style={{animationDelay:"0.875s"}}/>
<rect x="181" y="140" width="2" height="16" rx="1" style={{animationDelay:"0.910s"}}/>
<rect x="185" y="143" width="2" height="10" rx="1" style={{animationDelay:"0.945s"}}/>
<rect x="189" y="141" width="2" height="14" rx="1" style={{animationDelay:"0.980s"}}/>
<rect x="193" y="141" width="2" height="14" rx="1" style={{animationDelay:"1.015s"}}/>
<rect x="197" y="139" width="2" height="18" rx="1" style={{animationDelay:"1.050s"}}/>
<rect x="201" y="136" width="2" height="24" rx="1" style={{animationDelay:"1.085s"}}/>
<rect x="205" y="140" width="2" height="16" rx="1" style={{animationDelay:"1.120s"}}/>
<rect x="209" y="134" width="2" height="28" rx="1" style={{animationDelay:"1.155s"}}/>
<rect x="213" y="131" width="2" height="34" rx="1" style={{animationDelay:"1.190s"}}/>
<rect x="217" y="136" width="2" height="24" rx="1" style={{animationDelay:"1.225s"}}/>
<rect x="221" y="139" width="2" height="18" rx="1" style={{animationDelay:"1.260s"}}/>
<rect x="225" y="138" width="2" height="20" rx="1" style={{animationDelay:"1.295s"}}/>
<rect x="229" y="143" width="2" height="10" rx="1" style={{animationDelay:"1.330s"}}/>
<rect x="233" y="146" width="2" height="4" rx="1" style={{animationDelay:"1.365s"}}/></g>
        <text x="286" y="153" textAnchor="end" fill="currentColor" fontSize="13" fontFamily="-apple-system, BlinkMacSystemFont, sans-serif" style={{fontVariantNumeric:"tabular-nums"}}>{failed ? "重试" : time}</text>
    </svg>;
}
