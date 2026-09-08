import { HelpButton } from "@/app/components/HelpWindow";
import { feedbackIssueUrl, feedbackText } from "@/app/feedback";

export function FeedbackButton({ seed }: { readonly seed: number | null }): React.JSX.Element {
  return <HelpButton title="反馈问题" trigger="反馈问题" className="guide-open-button">
    <p>下一步会打开 GitHub 的反馈草稿，需要 GitHub 账号。只预填游戏版本、规则版本和种子，你可以修改后再提交。</p>
    <p>不会自动上传存档、完整日志、余额或操作记录。想附日志时，请先在游戏里点「导出本局」，检查内容后自行添加。GitHub Issue 是公开的。</p>
    <pre className="feedback-summary">{feedbackText(seed)}</pre>
    <a className="feedback-link" href={feedbackIssueUrl(seed)} target="_blank" rel="noopener noreferrer">到 GitHub 填写反馈</a>
  </HelpButton>;
}
