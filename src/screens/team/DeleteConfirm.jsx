import { Trash2, X } from "lucide-react";
import { Button } from "../../ui";
import "../../styles/screen-team.css";

// Встроенное подтверждение удаления: две кнопки рядом с объектом. Им пользуются
// разные экраны через renderDeleteConfirm в App.jsx; кнопки и подпись группы
// прежние («Подтвердить удаление», «Отмена»), поэтому тесты и привычки не ломаются.
export default function DeleteConfirm({ label, onConfirm, onCancel }) {
  return (
    <span className="dc-confirm" role="group" aria-label={`Подтверждение удаления ${label}`}>
      <Button variant="danger" size="sm" icon={Trash2} onClick={onConfirm}>
        Подтвердить удаление
      </Button>
      <Button variant="neutral" size="sm" icon={X} onClick={onCancel}>
        Отмена
      </Button>
    </span>
  );
}
