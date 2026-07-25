import React, {type ReactNode} from 'react';
import {
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

type SingleLineInputProps = Omit<TextInputProps, 'multiline'> & {
  containerClassName: string;
  inputClassName?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  formatValue?: (value: string) => string;
};

/**
 * Standard 40px single-line input used across mobile screens.
 * The full-height input and small bottom correction match the proven orders search field.
 */
export function SingleLineInput({
  containerClassName,
  inputClassName = '',
  leading,
  trailing,
  formatValue,
  onChangeText,
  ...props
}: SingleLineInputProps) {
  return (
    <View className={`h-10 flex-row items-center ${containerClassName}`}>
      {leading}
      <TextInput
        {...props}
        onChangeText={formatValue && onChangeText
          ? (value) => onChangeText(formatValue(value))
          : onChangeText}
        multiline={false}
        className={`h-full flex-1 pb-0.5 ${inputClassName}`}
      />
      {trailing}
    </View>
  );
}
