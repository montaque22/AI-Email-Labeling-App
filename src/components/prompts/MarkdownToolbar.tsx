import { Button } from "../ui/button";

type MarkdownToolbarProps = {
  disabled?: boolean;
  onInsert: (value: string) => void;
  onWrap: (prefix: string, suffix?: string) => void;
};

export function MarkdownToolbar({ disabled = false, onInsert, onWrap }: MarkdownToolbarProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button disabled={disabled} onClick={() => onWrap("**")} size="sm" type="button" variant="outline">
        Bold
      </Button>
      <Button disabled={disabled} onClick={() => onWrap("_")} size="sm" type="button" variant="outline">
        Italic
      </Button>
      <Button disabled={disabled} onClick={() => onInsert("\n## Heading\n")} size="sm" type="button" variant="outline">
        Heading
      </Button>
      <Button disabled={disabled} onClick={() => onInsert("\n- List item\n")} size="sm" type="button" variant="outline">
        List
      </Button>
      <Button disabled={disabled} onClick={() => onInsert("{confidenceThreshold}")} size="sm" type="button" variant="outline">
        {"{confidenceThreshold}"}
      </Button>
      <Button disabled={disabled} onClick={() => onInsert("{labelTable}")} size="sm" type="button" variant="outline">
        {"{labelTable}"}
      </Button>
    </div>
  );
}
