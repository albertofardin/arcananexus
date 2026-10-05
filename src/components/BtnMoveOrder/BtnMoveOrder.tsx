import Btn from "../_core/Btn";

export interface IBtnMoveOrder {
  canMoveUp: boolean;
  canMoveDown: boolean;
  disabled?: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

const BtnMoveOrder = ({
  canMoveUp,
  canMoveDown,
  disabled,
  onMoveUp,
  onMoveDown,
}: IBtnMoveOrder) => (
  <div className="flex shrink-0 flex-col gap-0 min-w-[36px]">
    <Btn
      className="m-0 min-h-0 h-[15px]"
      icon="keyboard_arrow_up"
      small
      disabled={disabled || !canMoveUp}
      onClick={onMoveUp}
    />
    <Btn
      className="m-0 min-h-0 h-[15px]"
      icon="keyboard_arrow_down"
      small
      disabled={disabled || !canMoveDown}
      onClick={onMoveDown}
    />
  </div>
);

export default BtnMoveOrder;
