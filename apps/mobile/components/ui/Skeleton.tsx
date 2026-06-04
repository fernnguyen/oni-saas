import React, {useEffect, useRef} from 'react';
import {Animated, View, type ViewStyle} from 'react-native';

export interface SkeletonProps {
 width?: number | string;
 height?: number | string;
 borderRadius?: number;
 className?: string;
 style?: ViewStyle;
}

export function Skeleton({
 width = '100%',
 height = 20,
 borderRadius = 8,
 className = '',
 style,
}: SkeletonProps) {
 const opacity = useRef(new Animated.Value(0.35)).current;

 useEffect(() => {
 // Tạo vòng lặp nhấp nháy vô tận bằng luồng native mượt mà
 const pulse = Animated.sequence([
 Animated.timing(opacity, {
 toValue: 0.75,
 duration: 900,
 useNativeDriver: true,
}),
 Animated.timing(opacity, {
 toValue: 0.35,
 duration: 900,
 useNativeDriver: true,
}),
 ]);

 Animated.loop(pulse).start();
}, [opacity]);

 const customStyle = {
 width: typeof width === 'number' ? width : undefined,
 height: typeof height === 'number' ? height : undefined,
 borderRadius,
 ...style,
};

 return (
 <Animated.View
 style={[
 customStyle,
 {
 opacity,
 backgroundColor: '#e2e8f0', // Slate-200 nhạt sang trọng
},
 ]}
 className={`overflow-hidden ${
 typeof width === 'string' && width.includes('%') ? 'w-full' : ''
} ${className}`}
 />
 );
}

// Subcomponents hỗ trợ nạp các khối phức tạp
Skeleton.Circle = function SkeletonCircle({size = 40, className = ''}: {size?: number; className?: string}) {
 return (
 <Skeleton
 width={size}
 height={size}
 borderRadius={size / 2}
 className={className}
 />
 );
};

Skeleton.Text = function SkeletonText({
 lines = 3, 
 gap = 8, 
 height = 14,
 className = '' 
}: {
 lines?: number; 
 gap?: number; 
 height?: number;
 className?: string;
}) {
 return (
 <View className={`w-full ${className}`}>
 {Array.from({length: lines}).map((_, index) => {
 // Cố định độ rộng ngẫu nhiên cho dòng cuối để giả lập đoạn văn thật
 const isLastLine = index === lines - 1;
 const width = isLastLine ? '60%' : '100%';
 return (
 <Skeleton
 key={index}
 width={width}
 height={height}
 borderRadius={height / 2}
 className={index < lines - 1 ? 'mb-2' : ''}
 style={{marginBottom: index < lines - 1 ? gap : 0}}
 />
 );
})}
 </View>
 );
};
