import { useEffect, useState } from "react";

const storageKey = "booktainer-theme";

export function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);
    if (stored === "dark" || stored === "light") {
      setTheme(stored);
      document.body.classList.toggle("theme-dark", stored === "dark");
    }
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.body.classList.toggle("theme-dark", next === "dark");
    window.localStorage.setItem(storageKey, next);
  };

  return { theme, toggleTheme };
}
