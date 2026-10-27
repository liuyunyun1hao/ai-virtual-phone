"use client";

// 天气 · App
// 纯前端实现：定位/城市搜索走 Open-Meteo 的 geocoding，天气预报走 Open-Meteo forecast，
// 都不需要 API Key，也不经过本站服务端。城市选择存在 localStorage，下次打开直接刷新。

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  Loader2,
  LocateFixed,
  MapPin,
  Moon,
  RefreshCw,
  Search,
  Sun,
  Sunrise,
  Sunset,
  Umbrella,
  Wind,
  X,
} from "lucide-react";

type WeatherAppProps = {
  onClose: () => void;
  onNotice?: (message: string) => void;
};

type Place = {
  name: string;
  admin1?: string;
  country?: string;
  latitude: number;
  longitude: number;
};

type WeatherKind = "sun" | "moon" | "partly" | "cloudy" | "fog" | "drizzle" | "rain" | "snow" | "thunder";

type Forecast = {
  current: {
    time: string;
    temperature: number;
    apparent: number;
    humidity: number;
    precipitation: number;
    code: number;
    isDay: boolean;
    wind: number;
  };
  hourly: Array<{ time: string; temperature: number; code: number; rainChance: number }>;
  daily: Array<{
    date: string;
    code: number;
    max: number;
    min: number;
    rainChance: number;
    sunrise: string;
    sunset: string;
  }>;
  fetchedAt: number;
};

const STORAGE_KEY = "avp.weather.place.v1";
const DEFAULT_PLACE: Place = {
  name: "上海",
  admin1: "上海市",
  country: "中国",
  latitude: 31.2222,
  longitude: 121.4581,
};

function loadStoredPlace(): Place | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Place>;
    if (typeof parsed.latitude !== "number" || typeof parsed.longitude !== "number" || typeof parsed.name !== "string") {
      return null;
    }
    return {
      name: parsed.name,
      admin1: typeof parsed.admin1 === "string" ? parsed.admin1 : undefined,
      country: typeof parsed.country === "string" ? parsed.country : undefined,
      latitude: parsed.latitude,
      longitude: parsed.longitude,
    };
  } catch {
    return null;
  }
}

function storePlace(place: Place) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(place));
  } catch {
    /* 隐私模式下写不进去就算了，下次重新选城市 */
  }
}

function weatherInfo(code: number, isDay = true): { label: string; kind: WeatherKind } {
  switch (code) {
    case 0:
      return { label: isDay ? "晴" : "晴夜", kind: isDay ? "sun" : "moon" };
    case 1:
      return { label: "大部晴朗", kind: isDay ? "sun" : "moon" };
    case 2:
      return { label: "多云", kind: "partly" };
    case 3:
      return { label: "阴", kind: "cloudy" };
    case 45:
    case 48:
      return { label: "有雾", kind: "fog" };
    case 51:
    case 53:
    case 55:
      return { label: "毛毛雨", kind: "drizzle" };
    case 56:
    case 57:
      return { label: "冻毛毛雨", kind: "drizzle" };
    case 61:
      return { label: "小雨", kind: "rain" };
    case 63:
      return { label: "中雨", kind: "rain" };
    case 65:
      return { label: "大雨", kind: "rain" };
    case 66:
    case 67:
      return { label: "冻雨", kind: "rain" };
    case 71:
      return { label: "小雪", kind: "snow" };
    case 73:
      return { label: "中雪", kind: "snow" };
    case 75:
      return { label: "大雪", kind: "snow" };
    case 77:
      return { label: "雪粒", kind: "snow" };
    case 80:
    case 81:
    case 82:
      return { label: "阵雨", kind: "rain" };
    case 85:
    case 86:
      return { label: "阵雪", kind: "snow" };
    case 95:
      return { label: "雷阵雨", kind: "thunder" };
    case 96:
    case 99:
      return { label: "雷雨伴冰雹", kind: "thunder" };
    default:
      return { label: "未知", kind: "cloudy" };
  }
}

function WeatherGlyph({ kind, size = 24, className }: { kind: WeatherKind; size?: number; className?: string }) {
  const props = { size, className, strokeWidth: 1.7 } as const;
  switch (kind) {
    case "sun":
      return <Sun {...props} />;
    case "moon":
      return <Moon {...props} />;
    case "partly":
      return <CloudSun {...props} />;
    case "cloudy":
      return <Cloud {...props} />;
    case "fog":
      return <CloudFog {...props} />;
    case "drizzle":
      return <CloudDrizzle {...props} />;
    case "rain":
      return <CloudRain {...props} />;
    case "snow":
      return <CloudSnow {...props} />;
    case "thunder":
      return <CloudLightning {...props} />;
    default:
      return <Cloud {...props} />;
  }
}

function placeSubtitle(place: Place): string {
  return [place.admin1, place.country].filter((part) => part && part !== place.name).join(" · ");
}

function formatHour(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "--";
  return `${String(date.getHours()).padStart(2, "0")}:00`;
}

function formatWeekday(iso: string): string {
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][date.getDay()];
}

function formatClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "--";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

type ForecastResponse = {
  current?: {
    time?: string;
    temperature_2m?: number;
    apparent_temperature?: number;
    relative_humidity_2m?: number;
    precipitation?: number;
    weather_code?: number;
    is_day?: number;
    wind_speed_10m?: number;
  };
  hourly?: {
    time?: string[];
    temperature_2m?: number[];
    weather_code?: number[];
    precipitation_probability?: number[];
  };
  daily?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_probability_max?: number[];
    sunrise?: string[];
    sunset?: string[];
  };
};

async function fetchForecast(place: Place, signal: AbortSignal): Promise<Forecast> {
  const params = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    current: "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m",
    hourly: "temperature_2m,weather_code,precipitation_probability",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset",
    timezone: "auto",
    forecast_days: "7",
    wind_speed_unit: "kmh",
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, { signal, cache: "no-store" });
  if (!response.ok) throw new Error(`天气接口返回 ${response.status}`);
  const data = (await response.json()) as ForecastResponse;
  const current = data.current;
  const hourly = data.hourly;
  const daily = data.daily;
  if (!current || !hourly?.time?.length || !daily?.time?.length) {
    throw new Error("天气接口没有返回完整数据");
  }

  const currentTime = current.time ?? hourly.time[0];
  const startIndex = Math.max(
    0,
    hourly.time.findIndex((time) => time.slice(0, 13) === currentTime.slice(0, 13)),
  );
  const hourlyItems = hourly.time.slice(startIndex, startIndex + 24).map((time, offset) => ({
    time,
    temperature: hourly.temperature_2m?.[startIndex + offset] ?? 0,
    code: hourly.weather_code?.[startIndex + offset] ?? current.weather_code ?? 0,
    rainChance: hourly.precipitation_probability?.[startIndex + offset] ?? 0,
  }));

  const dailyItems = daily.time.map((date, index) => ({
    date,
    code: daily.weather_code?.[index] ?? 0,
    max: daily.temperature_2m_max?.[index] ?? 0,
    min: daily.temperature_2m_min?.[index] ?? 0,
    rainChance: daily.precipitation_probability_max?.[index] ?? 0,
    sunrise: daily.sunrise?.[index] ?? "",
    sunset: daily.sunset?.[index] ?? "",
  }));

  return {
    current: {
      time: currentTime,
      temperature: current.temperature_2m ?? 0,
      apparent: current.apparent_temperature ?? current.temperature_2m ?? 0,
      humidity: current.relative_humidity_2m ?? 0,
      precipitation: current.precipitation ?? 0,
      code: current.weather_code ?? 0,
      isDay: (current.is_day ?? 1) === 1,
      wind: current.wind_speed_10m ?? 0,
    },
    hourly: hourlyItems,
    daily: dailyItems,
    fetchedAt: Date.now(),
  };
}

type GeoResult = {
  id: number;
  name: string;
  admin1?: string;
  country?: string;
  latitude: number;
  longitude: number;
};

async function searchPlaces(query: string, signal: AbortSignal): Promise<GeoResult[]> {
  const params = new URLSearchParams({
    name: query,
    count: "8",
    language: "zh",
    format: "json",
  });
  const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params.toString()}`, {
    signal,
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`城市搜索失败 ${response.status}`);
  const data = (await response.json()) as { results?: GeoResult[] };
  return (data.results ?? []).filter((item) => typeof item.latitude === "number" && typeof item.longitude === "number");
}

async function reverseGeocode(latitude: number, longitude: number): Promise<Place> {
  const fallback: Place = { name: "当前位置", latitude, longitude };
  try {
    const response = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=zh`,
      { cache: "no-store" },
    );
    if (!response.ok) return fallback;
    const data = (await response.json()) as {
      city?: string;
      locality?: string;
      principalSubdivision?: string;
      countryName?: string;
    };
    const name = data.city || data.locality || "当前位置";
    return {
      name,
      admin1: data.principalSubdivision || undefined,
      country: data.countryName || undefined,
      latitude,
      longitude,
    };
  } catch {
    return fallback;
  }
}

export function WeatherApp({ onClose, onNotice }: WeatherAppProps) {
  const [place, setPlace] = useState<Place>(() => loadStoredPlace() ?? DEFAULT_PLACE);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeoResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    fetchForecast(place, controller.signal)
      .then((data) => {
        if (requestId !== requestIdRef.current) return;
        setForecast(data);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted || requestId !== requestIdRef.current) return;
        const message = cause instanceof Error ? cause.message : "天气加载失败";
        setError(message);
        onNotice?.(message);
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setLoading(false);
      });
    return () => controller.abort();
  }, [place, refreshKey, onNotice]);

  useEffect(() => {
    if (!searchOpen) return;
    const timer = window.setTimeout(() => searchInputRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, [searchOpen]);

  useEffect(() => {
    const keyword = query.trim();
    if (!searchOpen || keyword.length === 0) {
      setResults([]);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    const timer = window.setTimeout(() => {
      searchPlaces(keyword, controller.signal)
        .then((items) => {
          if (!controller.signal.aborted) setResults(items);
        })
        .catch(() => {
          if (!controller.signal.aborted) setResults([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, 320);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, searchOpen]);

  const choosePlace = useCallback(
    (next: Place) => {
      setPlace(next);
      storePlace(next);
      setSearchOpen(false);
      setQuery("");
      setResults([]);
      setRefreshKey((value) => value + 1);
    },
    [],
  );

  const handleLocate = useCallback(() => {
    if (!navigator.geolocation) {
      onNotice?.("这台设备不支持定位，手动搜索城市吧");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const next = await reverseGeocode(position.coords.latitude, position.coords.longitude);
          choosePlace(next);
        } finally {
          setLocating(false);
        }
      },
      (cause) => {
        setLocating(false);
        const message =
          cause.code === cause.PERMISSION_DENIED
            ? "定位权限被拒绝了，可以手动搜索城市"
            : "定位失败，可以手动搜索城市";
        onNotice?.(message);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 10 * 60 * 1000 },
    );
  }, [choosePlace, onNotice]);

  const current = forecast?.current ?? null;
  const currentInfo = current ? weatherInfo(current.code, current.isDay) : null;
  const tone = current ? (current.isDay ? "day" : "night") : "day";
  const today = forecast?.daily[0] ?? null;

  const dailyRange = useMemo(() => {
    if (!forecast?.daily.length) return { min: 0, max: 1 };
    const min = Math.min(...forecast.daily.map((day) => day.min));
    const max = Math.max(...forecast.daily.map((day) => day.max));
    return { min, max: max === min ? min + 1 : max };
  }, [forecast]);

  return (
    <div className="weather-app" data-tone={tone}>
      <header className="weather-header">
        <button type="button" className="weather-icon-btn" onClick={onClose} aria-label="关闭">
          <ChevronLeft size={22} />
        </button>
        <div className="weather-header-title">
          <span className="weather-header-city">
            <MapPin size={13} aria-hidden />
            {place.name}
          </span>
          {placeSubtitle(place) ? <span className="weather-header-sub">{placeSubtitle(place)}</span> : null}
        </div>
        <div className="weather-header-actions">
          <button
            type="button"
            className="weather-icon-btn"
            onClick={() => setSearchOpen(true)}
            aria-label="搜索城市"
            title="搜索城市"
          >
            <Search size={18} />
          </button>
          <button
            type="button"
            className="weather-icon-btn"
            onClick={handleLocate}
            aria-label="定位到当前位置"
            title="定位到当前位置"
            disabled={locating}
          >
            {locating ? <Loader2 size={18} className="weather-spin" /> : <LocateFixed size={18} />}
          </button>
          <button
            type="button"
            className="weather-icon-btn"
            onClick={() => setRefreshKey((value) => value + 1)}
            aria-label="刷新天气"
            title="刷新天气"
            disabled={loading}
          >
            <RefreshCw size={18} className={loading ? "weather-spin" : undefined} />
          </button>
        </div>
      </header>

      <div className="weather-scroll">
        {loading && !forecast ? (
          <div className="weather-loading">
            <Loader2 size={26} className="weather-spin" />
            <span>正在获取天气…</span>
          </div>
        ) : null}

        {!loading && !forecast && error ? (
          <div className="weather-loading">
            <Cloud size={26} />
            <span>{error}</span>
            <button type="button" className="weather-retry" onClick={() => setRefreshKey((value) => value + 1)}>
              重试
            </button>
          </div>
        ) : null}

        {forecast && current && currentInfo ? (
          <>
            <section className="weather-hero">
              <div className="weather-hero-main">
                <div className="weather-hero-temp">
                  {Math.round(current.temperature)}
                  <span>°</span>
                </div>
                <div className="weather-hero-desc">
                  <WeatherGlyph kind={currentInfo.kind} size={34} />
                  <span>{currentInfo.label}</span>
                </div>
              </div>
              <div className="weather-hero-meta">
                <span>体感 {Math.round(current.apparent)}°</span>
                {today ? <span>今日 {Math.round(today.min)}° / {Math.round(today.max)}°</span> : null}
                <span>
                  {today?.rainChance ? `降水 ${today.rainChance}%` : "暂无降水"} · 更新 {formatClock(new Date(forecast.fetchedAt).toISOString())}
                </span>
              </div>
            </section>

            <section className="weather-card weather-metrics">
              <div className="weather-metric">
                <Droplets size={16} />
                <span className="weather-metric-label">湿度</span>
                <span className="weather-metric-value">{Math.round(current.humidity)}%</span>
              </div>
              <div className="weather-metric">
                <Wind size={16} />
                <span className="weather-metric-label">风速</span>
                <span className="weather-metric-value">{Math.round(current.wind)} km/h</span>
              </div>
              <div className="weather-metric">
                <Umbrella size={16} />
                <span className="weather-metric-label">降水</span>
                <span className="weather-metric-value">{current.precipitation.toFixed(1)} mm</span>
              </div>
              {today?.sunrise ? (
                <div className="weather-metric">
                  <Sunrise size={16} />
                  <span className="weather-metric-label">日出</span>
                  <span className="weather-metric-value">{formatClock(today.sunrise)}</span>
                </div>
              ) : null}
              {today?.sunset ? (
                <div className="weather-metric">
                  <Sunset size={16} />
                  <span className="weather-metric-label">日落</span>
                  <span className="weather-metric-value">{formatClock(today.sunset)}</span>
                </div>
              ) : null}
            </section>

            <section className="weather-card">
              <h2 className="weather-card-title">未来 24 小时</h2>
              <div className="weather-hourly hide-scrollbar">
                {forecast.hourly.map((hour) => {
                  const info = weatherInfo(hour.code, true);
                  return (
                    <div key={hour.time} className="weather-hour">
                      <span className="weather-hour-time">{formatHour(hour.time)}</span>
                      <WeatherGlyph kind={info.kind} size={20} className="weather-hour-icon" />
                      <span className="weather-hour-temp">{Math.round(hour.temperature)}°</span>
                      <span className="weather-hour-rain">{hour.rainChance > 0 ? `${hour.rainChance}%` : "—"}</span>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="weather-card">
              <h2 className="weather-card-title">未来 7 天</h2>
              <div className="weather-daily">
                {forecast.daily.map((day, index) => {
                  const info = weatherInfo(day.code, true);
                  const left = ((day.min - dailyRange.min) / (dailyRange.max - dailyRange.min)) * 100;
                  const width = Math.max(((day.max - day.min) / (dailyRange.max - dailyRange.min)) * 100, 6);
                  return (
                    <div key={day.date} className="weather-day-row">
                      <span className="weather-day-name">{index === 0 ? "今天" : formatWeekday(day.date)}</span>
                      <span className="weather-day-icon">
                        <WeatherGlyph kind={info.kind} size={19} />
                      </span>
                      <span className="weather-day-rain">{day.rainChance > 0 ? `${day.rainChance}%` : "—"}</span>
                      <span className="weather-day-min">{Math.round(day.min)}°</span>
                      <span className="weather-day-bar">
                        <i style={{ left: `${left}%`, width: `${width}%` }} />
                      </span>
                      <span className="weather-day-max">{Math.round(day.max)}°</span>
                    </div>
                  );
                })}
              </div>
            </section>

            <footer className="weather-footer">
              数据来自 Open-Meteo · 城市场景更贴合你手边的天气
            </footer>
          </>
        ) : null}
      </div>

      {searchOpen ? (
        <div className="weather-search-layer" role="dialog" aria-label="搜索城市">
          <div className="weather-search-head">
            <div className="weather-search-input">
              <Search size={16} />
              <input
                ref={searchInputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索城市，例如 杭州 / Tokyo"
                aria-label="城市名"
              />
              {searching ? <Loader2 size={15} className="weather-spin" /> : null}
            </div>
            <button type="button" className="weather-icon-btn" onClick={() => setSearchOpen(false)} aria-label="关闭搜索">
              <X size={20} />
            </button>
          </div>
          <div className="weather-search-results">
            {searching && results.length === 0 ? <div className="weather-search-hint">正在搜索…</div> : null}
            {!searching && query.trim().length > 0 && results.length === 0 ? (
              <div className="weather-search-hint">没有找到这个城市</div>
            ) : null}
            {query.trim().length === 0 ? (
              <div className="weather-search-hint">
                常用：上海 · 北京 · 广州 · 深圳 · 成都 · 杭州
              </div>
            ) : null}
            {results.map((item) => (
              <button
                key={item.id}
                type="button"
                className="weather-search-item"
                onClick={() =>
                  choosePlace({
                    name: item.name,
                    admin1: item.admin1,
                    country: item.country,
                    latitude: item.latitude,
                    longitude: item.longitude,
                  })
                }
              >
                <span className="weather-search-item-name">{item.name}</span>
                <span className="weather-search-item-sub">
                  {[item.admin1, item.country].filter(Boolean).join(" · ")}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
