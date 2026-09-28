import { setLanguage, useLanguage } from "@/i18n/language";

export function LanguageSelector(): React.JSX.Element {
  const language = useLanguage();
  return <div className="language-selector" role="group" aria-label="Language / 语言" translate="no">
    <button type="button" lang="zh-CN" aria-pressed={language === "zh"} onClick={() => setLanguage("zh")} translate="no">中文</button>
    <span aria-hidden="true">/</span>
    <button type="button" lang="en" aria-pressed={language === "en"} onClick={() => setLanguage("en")} translate="no">English</button>
  </div>;
}
